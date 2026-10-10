#!/usr/bin/env python3
"""
One-off team photo optimiser for the BLITZ site.

    pip install pillow pillow-heif
    python tools/optimize-team-images.py                 # reads assets/team_images/
    python tools/optimize-team-images.py --src ~/Downloads/team --out assets/images/team

What it does for every file listed in PHOTOS below:
  1. opens HEIC / HEIF / PNG / JPEG / WebP (HEIC needs pillow-heif)
  2. applies EXIF orientation FIRST, then drops all metadata (GPS, camera, etc.)
  3. crops a square biased toward the top of portrait photos (the face lives there):
     the crop is centred ~35% down from the top edge unless overridden in CROP_CENTER
  4. resizes to 400x400 and saves lowercase WebP (quality 80, lowered only if >50 KB)
Output names are the hyphenated slugs (e.g. aksh-kumar.webp); original filenames are
never referenced by the site. After running, review the crops (a contact sheet is written
to <out>/_contact-sheet.png unless --no-sheet) and delete the --src folder.
"""
import argparse
import os
import sys

from PIL import Image, ImageOps, ImageDraw

try:
    from pillow_heif import register_heif_opener
    register_heif_opener()
except ImportError:  # only needed for .heic/.heif inputs
    pass

SIZE = 400
QUALITY = 80
MAX_BYTES = 50 * 1024
DEFAULT_CENTER_Y = 0.35          # crop centre, as a fraction of image height (portraits)

# source file stem (case-insensitive, any extension) -> output slug
PHOTOS = {
    "aksh": "aksh-kumar",
    "priyal": "priyal-vatsa",
    "dev": "dev-narayan",
    "kavya": "kavya-gera",
    "parth": "parth-arora",
    "riya": "riya-solanki",
    "sachi": "sachi-grover",
    "shaurya": "shaurya",
    "aditya": "aditya-raj",
    "diva": "diva-bauddh",
    "eesha": "eesha",
    "neha": "neha-bisht",
    "yashika": "yashika-gupta",
}

# Per-photo overrides chosen after visually reviewing every crop:
#   slug -> (centre_x, centre_y, zoom)   centre as fractions of the full image,
#   zoom = crop side as a fraction of the shorter edge (1.0 = widest square, 0.5 = 2x closer)
CROP_CENTER = {
    "priyal-vatsa": (0.50, 0.45, 1.0),    # face was sitting low in the frame
    "shaurya":      (0.50, 0.44, 1.0),
    "dev-narayan":  (0.475, 0.45, 0.42),  # subject is small/far away: zoom to head & shoulders
    "riya-solanki": (0.50, 0.36, 0.50),
    "eesha":        (0.45, 0.2375, 0.50),
    "neha-bisht":   (0.47, 0.402, 0.60),
    "diva-bauddh":  (0.40, 0.35, 0.80),   # face is left of centre in the original
}


def find_source(src_dir, stem):
    for name in sorted(os.listdir(src_dir)):
        base, ext = os.path.splitext(name)
        if base.lower() == stem and ext.lower() in {".heic", ".heif", ".png", ".jpg", ".jpeg", ".webp"}:
            return os.path.join(src_dir, name)
    return None


def square_crop(im, slug):
    w, h = im.size
    cx_f, cy_f, zoom = CROP_CENTER.get(slug, (0.5, DEFAULT_CENTER_Y if h > w else 0.5, 1.0))
    side = round(min(w, h) * zoom)
    left = round(min(max(cx_f * w - side / 2, 0), w - side))
    top = round(min(max(cy_f * h - side / 2, 0), h - side))
    return im.crop((left, top, left + side, top + side))


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--src", default=os.path.join(root, "assets", "team_images"))
    ap.add_argument("--out", default=os.path.join(root, "assets", "images", "team"))
    ap.add_argument("--no-sheet", action="store_true", help="skip the review contact sheet")
    args = ap.parse_args()

    if not os.path.isdir(args.src):
        sys.exit(f"Source folder not found: {args.src}")
    os.makedirs(args.out, exist_ok=True)

    total_in = total_out = 0
    done = []
    for stem, slug in PHOTOS.items():
        path = find_source(args.src, stem)
        if not path:
            print(f"  - {slug}: no source file '{stem}.*' (skipped)")
            continue
        with Image.open(path) as im:
            im = ImageOps.exif_transpose(im)          # 1. orientation first
            im = im.convert("RGB")                    #    (also strips alpha / ICC tricks)
            im = square_crop(im, slug).resize((SIZE, SIZE), Image.Resampling.LANCZOS)
        dest = os.path.join(args.out, slug + ".webp")
        q = QUALITY
        while True:
            im.save(dest, "WEBP", quality=q, method=6)  # no exif/icc passed => metadata stripped
            if os.path.getsize(dest) <= MAX_BYTES or q <= 55:
                break
            q -= 5
        a, b = os.path.getsize(path), os.path.getsize(dest)
        total_in += a
        total_out += b
        done.append((slug, dest))
        print(f"  {slug:15s} {a/1024:8.0f} KB -> {b/1024:5.1f} KB (q{q})")

    print(f"Total: {total_in/1024/1024:.2f} MB -> {total_out/1024:.0f} KB")

    if done and not args.no_sheet:
        cols = 5
        rows = (len(done) + cols - 1) // cols
        sheet = Image.new("RGB", (cols * 210, rows * 230), (30, 30, 30))
        d = ImageDraw.Draw(sheet)
        for i, (slug, dest) in enumerate(done):
            x, y = (i % cols) * 210 + 5, (i // cols) * 230 + 5
            sheet.paste(Image.open(dest).resize((200, 200)), (x, y))
            d.text((x, y + 205), slug, fill=(255, 255, 255))
        sheet.save(os.path.join(args.out, "_contact-sheet.png"))
        print("Review sheet: _contact-sheet.png (delete it before committing)")


if __name__ == "__main__":
    main()
