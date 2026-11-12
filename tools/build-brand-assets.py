#!/usr/bin/env python3
"""
Regenerates every logo-derived asset from assets/logo/blitz-logo-source.webp
(the untouched, full-size master supplied by the society).

    pip install pillow
    python tools/build-brand-assets.py

Outputs
  assets/logo/blitz-logo.png          512px wide, white on transparent (site, JSON-LD)
  assets/logo/blitz-logo-1024.png     1024px wide, for retina hero (srcset)
  assets/logo/blitz-logo-dark.png     512px wide, ink on transparent (light backgrounds)
  favicon.ico (16/32/48), favicon-16.png, favicon-32.png
  apple-touch-icon.png (180, solid), icon-192.png, icon-512.png (solid, maskable-safe)
  assets/og.png (1200x630)
"""
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "logo", "blitz-logo-source.webp")
HERO_BG = os.path.join(ROOT, "assets", "images", "hero-ring-bg.webp")

# Synced with styles.css :root tokens
INK = (38, 21, 26)             # --ink            #26151A
MAROON_DEEP = (66, 18, 30)     # --maroon-deep    #42121E
MAROON = (101, 28, 42)         # --maroon         #651C2A
MAROON_BRIGHT = (122, 41, 58)  # --maroon-bright  #7A293A
CREAM = (255, 249, 242)        # --cream          #FFF9F2
ACCENT = (212, 164, 92)        # --accent         #D4A45C


def p(*a):
    return os.path.join(ROOT, *a)


def save_png(im, path, colors=None):
    if colors:  # palette-quantise (keeps alpha) for tiny files
        im = im.quantize(colors=colors, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    im.save(path, optimize=True)
    print(f"{os.path.relpath(path, ROOT):38s} {os.path.getsize(path)/1024:7.1f} KB  {im.size}")


src = Image.open(SRC).convert("RGBA")
bbox = src.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
pad = int(0.012 * (bbox[2] - bbox[0]))  # ~1.2% breathing room so AA edges never clip
bbox = (bbox[0] - pad, bbox[1] - pad, bbox[2] + pad, bbox[3] + pad)
mark = src.crop(bbox)
RATIO = mark.width / mark.height
print("trimmed mark", mark.size, "ratio %.4f" % RATIO)


def resized(im, w):
    return im.resize((w, round(w / RATIO)), Image.Resampling.LANCZOS)


os.makedirs(p("assets", "logo"), exist_ok=True)
logo512 = resized(mark, 512)
save_png(logo512, p("assets", "logo", "blitz-logo.png"), colors=32)
save_png(resized(mark, 1024), p("assets", "logo", "blitz-logo-1024.png"), colors=32)
dark = Image.new("RGBA", logo512.size, INK + (255,))
dark.putalpha(logo512.getchannel("A"))
save_png(dark, p("assets", "logo", "blitz-logo-dark.png"), colors=32)
hi = resized(mark, 1600)  # high-res master for downsampling


def tile(size, bg, width_frac, rounded=0):
    """Square tile, logo centred at width_frac of the side."""
    S = size * 4  # supersample
    im = Image.new("RGBA", (S, S), bg + (255,))
    w = round(S * width_frac)
    lg = hi.resize((w, round(w / RATIO)), Image.Resampling.LANCZOS)
    im.alpha_composite(lg, ((S - lg.width) // 2, (S - lg.height) // 2))
    if rounded:
        m = Image.new("L", (S, S), 0)
        ImageDraw.Draw(m).rounded_rectangle((0, 0, S - 1, S - 1), radius=round(S * rounded), fill=255)
        im.putalpha(m)
    return im.resize((size, size), Image.Resampling.LANCZOS)


f16, f32, f48 = (tile(s, INK, 0.92, rounded=0.18) for s in (16, 32, 48))
save_png(f16, p("favicon-16.png"))
save_png(f32, p("favicon-32.png"))
f48.save(p("favicon.ico"), format="ICO", sizes=[(16, 16), (32, 32), (48, 48)], append_images=[f32, f16])
print(f"{'favicon.ico':38s} {os.path.getsize(p('favicon.ico'))/1024:7.1f} KB  16/32/48")
save_png(tile(180, INK, 0.70), p("apple-touch-icon.png"))
save_png(tile(192, INK, 0.62), p("icon-192.png"))
save_png(tile(512, INK, 0.62), p("icon-512.png"))

# --- Open Graph social card (1200x630) ---
W, H = 1200, 630
og = Image.new("RGB", (W, H), INK)
px = og.load()
cx, cy = W * 0.5, H * 0.36
maxd = (W ** 2 + H ** 2) ** 0.5 * 0.62
for y in range(H):
    for x in range(W):
        d = ((x - cx) ** 2 + ((y - cy) * 1.25) ** 2) ** 0.5 / maxd
        t = max(0.0, 1.0 - d)
        t = t * t * (3 - 2 * t)
        px[x, y] = tuple(round(INK[i] + (MAROON_BRIGHT[i] - INK[i]) * t) for i in range(3))

if os.path.exists(HERO_BG):
    bg_img = Image.open(HERO_BG).convert("RGB")
    # Cover-crop 1200x630
    bg_ratio = bg_img.width / bg_img.height
    target_ratio = W / H
    if bg_ratio > target_ratio:
        nh = H
        nw = round(H * bg_ratio)
    else:
        nw = W
        nh = round(W / bg_ratio)
    bg_resized = bg_img.resize((nw, nh), Image.Resampling.LANCZOS)
    left = (nw - W) // 2
    top = (nh - H) // 2
    bg_cropped = bg_resized.crop((left, top, left + W, top + H))
    og = Image.blend(og, bg_cropped, 0.84)

og = og.convert("RGBA")

# Dark vignette at bottom and center behind text for maximum contrast
vignette = Image.new("RGBA", (W, H), (0, 0, 0, 0))
vpx = vignette.load()
for y in range(H):
    fy = max(0.0, (y - H * 0.52) / (H * 0.48))
    bot_a = round(215 * (fy ** 1.35))
    for x in range(W):
        vpx[x, y] = (18, 6, 10, bot_a)
og.alpha_composite(vignette)

dr = ImageDraw.Draw(og)
for y in (54, 496):
    for x in range(64, W - 64, 8):
        dr.rectangle((x, y, x + 2, y + 1), fill=ACCENT + (120,))

lw = 540
lg = hi.resize((lw, round(lw / RATIO)), Image.Resampling.LANCZOS)
shadow = Image.new("RGBA", og.size, (0, 0, 0, 0))
sh = Image.new("RGBA", lg.size, (12, 4, 6, 255))
sh.putalpha(lg.getchannel("A").point(lambda v: int(v * 0.68)))
shadow.alpha_composite(sh, ((W - lg.width) // 2, (H - lg.height) // 2 - 24 + 12))
og.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(16)))
og.alpha_composite(lg, ((W - lg.width) // 2, (H - lg.height) // 2 - 24))


def load_font(size, mono=False):
    candidates = (
        [
            "C:/Windows/Fonts/consolab.ttf",
            "C:/Windows/Fonts/consola.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
            "/System/Library/Fonts/Menlo.ttc",
        ]
        if mono
        else [
            "C:/Windows/Fonts/segoeuib.ttf",
            "C:/Windows/Fonts/segoeui.ttf",
            "C:/Windows/Fonts/arialbd.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        ]
    )
    for f in candidates:
        if os.path.exists(f):
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


def centred(text, y, fnt, fill, spacing=0):
    w = sum(dr.textlength(c, font=fnt) + spacing for c in text) - spacing
    x = (W - w) / 2
    for c in text:
        dr.text((x, y), c, font=fnt, fill=fill)
        x += dr.textlength(c, font=fnt) + spacing


dr = ImageDraw.Draw(og)
centred("COMPUTER SCIENCE SOCIETY", 518, load_font(22, mono=True), ACCENT + (255,), spacing=4)
centred("Keshav Mahavidyalaya  •  University of Delhi", 558, load_font(20, mono=False), CREAM + (235,), spacing=1)
save_png(og.convert("RGB"), p("assets", "og.png"))
