#!/usr/bin/env python3
"""
Change the production URL everywhere it is hard-coded (crawlers and social scrapers
need absolute URLs, so it cannot be a runtime variable).

    python tools/set-site-url.py https://blitz-kmv.example.org/
    python tools/set-site-url.py https://aksh.is-a.dev/BLITZ/      # (current default)

The current URL is read from <link rel="canonical"> in index.html, then replaced in
index.html (canonical, og:url, og:image, twitter:image, JSON-LD), sitemap.xml,
robots.txt and README.md.
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = ["index.html", "sitemap.xml", "robots.txt", "README.md"]


def main():
    if len(sys.argv) != 2 or not re.match(r"^https?://[^\s]+$", sys.argv[1]):
        sys.exit(__doc__)
    new = sys.argv[1] if sys.argv[1].endswith("/") else sys.argv[1] + "/"
    html = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
    m = re.search(r'<link rel="canonical" href="([^"]+)"', html)
    if not m:
        sys.exit("Could not find <link rel=\"canonical\"> in index.html")
    old = m.group(1)
    if old == new:
        sys.exit(f"Already {new}")
    for name in FILES:
        path = os.path.join(ROOT, name)
        if not os.path.exists(path):
            continue
        text = open(path, encoding="utf-8").read()
        count = text.count(old)
        if count:
            open(path, "w", encoding="utf-8").write(text.replace(old, new))
        print(f"{name:14s} {count} replacement(s)")
    print(f"{old}  ->  {new}")


if __name__ == "__main__":
    main()
