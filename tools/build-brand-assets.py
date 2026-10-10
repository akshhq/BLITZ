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
INK = (11, 5, 6)           # --ink      #0b0506
MAROON = (76, 0, 0)        # --maroon   #4c0000
MAROON_BRIGHT = (122, 16, 16)
CREAM = (244, 241, 232)

def p(*a): return os.path.join(ROOT, *a)

def save_png(im, path, colors=None):
    if colors:  # palette-quantise (keeps alpha) for tiny files
        im = im.quantize(colors=colors, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    im.save(path, optimize=True)
    print(f"{os.path.relpath(path, ROOT):38s} {os.path.getsize(path)/1024:7.1f} KB  {im.size}")

# ---- 1. trim the empty canvas around the mark ------------------------------
src = Image.open(SRC).convert("RGBA")
bbox = src.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
pad = int(0.012 * (bbox[2] - bbox[0]))          # ~1.2% breathing room so AA edges never clip
bbox = (bbox[0]-pad, bbox[1]-pad, bbox[2]+pad, bbox[3]+pad)
mark = src.crop(bbox)
RATIO = mark.width / mark.height
print("trimmed mark", mark.size, "ratio %.4f" % RATIO)

def resized(im, w):
    return im.resize((w, round(w / RATIO)), Image.Resampling.LANCZOS)

os.makedirs(p("assets", "logo"), exist_ok=True)
logo512 = resized(mark, 512)
save_png(logo512, p("assets", "logo", "blitz-logo.png"), colors=32)
save_png(resized(mark, 1024), p("assets", "logo", "blitz-logo-1024.png"), colors=32)

# dark variant: same alpha, ink colour
dark = Image.new("RGBA", logo512.size, INK + (255,))
dark.putalpha(logo512.getchannel("A"))
save_png(dark, p("assets", "logo", "blitz-logo-dark.png"), colors=32)

# ---- 2. icons ----------------------------------------------------------------
hi = resized(mark, 1600)   # high-res master for downsampling

def tile(size, bg, width_frac, rounded=0):
    """Square tile, logo centred at width_frac of the side."""
    S = size * 4  # supersample
    im = Image.new("RGBA", (S, S), bg + (255,))
    w = round(S * width_frac)
    lg = hi.resize((w, round(w / RATIO)), Image.Resampling.LANCZOS)
    im.alpha_composite(lg, ((S - lg.width)//2, (S - lg.height)//2))
    if rounded:
        m = Image.new("L", (S, S), 0)
        ImageDraw.Draw(m).rounded_rectangle((0, 0, S-1, S-1), radius=round(S*rounded), fill=255)
        im.putalpha(m)
    return im.resize((size, size), Image.Resampling.LANCZOS)

# small favicons: logo fills ~90% of the tile; slightly rounded so it sits nicely in a tab
f16, f32, f48 = (tile(s, INK, 0.92, rounded=0.18) for s in (16, 32, 48))
save_png(f16, p("favicon-16.png"))
save_png(f32, p("favicon-32.png"))
f48.save(p("favicon.ico"), format="ICO", sizes=[(16,16),(32,32),(48,48)],
         append_images=[f32, f16])
print(f"{'favicon.ico':38s} {os.path.getsize(p('favicon.ico'))/1024:7.1f} KB  16/32/48")

# solid, full-bleed tiles (no transparency) – OS applies its own mask.
# 62% width keeps the whole mark inside the 80% maskable safe-zone circle.
save_png(tile(180, INK, 0.70), p("apple-touch-icon.png"))
save_png(tile(192, INK, 0.62), p("icon-192.png"))
save_png(tile(512, INK, 0.62), p("icon-512.png"))

# ---- 3. Open Graph banner 1200x630 -------------------------------------------
W, H = 1200, 630
og = Image.new("RGB", (W, H), INK)
px = og.load()
# brand gradient: maroon glow top-centre fading to ink (same palette as the hero surface)
cx, cy = W * 0.5, H * 0.38
maxd = (W**2 + H**2) ** 0.5 * 0.62
for y in range(H):
    for x in range(W):
        d = ((x-cx)**2 + ((y-cy)*1.25)**2) ** 0.5 / maxd
        t = max(0.0, 1.0 - d)
        t = t * t * (3 - 2*t)
        px[x, y] = tuple(round(INK[i] + (MAROON_BRIGHT[i]*0.78 - INK[i]) * t) for i in range(3))
og = og.convert("RGBA")
# amber hairlines echo the site's dotted marquee rules
dr = ImageDraw.Draw(og)
for y in (58, 502):
    for x in range(64, W-64, 8):
        dr.rectangle((x, y, x+2, y+1), fill=(255, 176, 0, 105))
lw = 620
lg = hi.resize((lw, round(lw/RATIO)), Image.Resampling.LANCZOS)
shadow = Image.new("RGBA", og.size, (0,0,0,0))
sh = Image.new("RGBA", lg.size, (0,0,0,255)); sh.putalpha(lg.getchannel("A").point(lambda v: v*0.55))
shadow.alpha_composite(sh, ((W-lg.width)//2, (H-lg.height)//2 - 8 + 12))
og.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(14)))
og.alpha_composite(lg, ((W-lg.width)//2, (H-lg.height)//2 - 8))

def font(size):
    for f in ("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",):
        if os.path.exists(f): return ImageFont.truetype(f, size)
    return ImageFont.load_default()
def centred(text, y, fnt, fill, spacing=0):
    w = sum(dr.textlength(c, font=fnt) + spacing for c in text) - spacing
    x = (W - w) / 2
    for c in text:
        dr.text((x, y), c, font=fnt, fill=fill)
        x += dr.textlength(c, font=fnt) + spacing
dr = ImageDraw.Draw(og)
centred("COMPUTER SCIENCE SOCIETY", 524, font(22), (255, 176, 0, 255), spacing=4)
centred("Keshav Mahavidyalaya, University of Delhi", 562, font(20), CREAM + (255,), spacing=1)
# Full-colour PNG: the radial gradient bands badly when palette-quantised.
save_png(og.convert("RGB"), p("assets", "og.png"))
