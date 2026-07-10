"""
Build a static copy of the app in `dist/` suitable for GitHub Pages.
- Copies `static/` -> `dist/`
- Copies `data/*.json` -> `dist/data/`
- Adjusts `index.html` to insert `scripts/fetch-mock.js` before `scripts/main.js`
- Rewrites node_modules script tags to CDN equivalents

Usage: python scripts/build_for_gh_pages.py

This script does not push anything to Git.
"""
import os
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STATIC = ROOT / 'static'
DATA = ROOT / 'data'
DIST = ROOT / 'dist'

CDN_REPLACEMENTS = {
    '/node_modules/d3/dist/d3.min.js': 'https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.4/d3.min.js',
    '/node_modules/topojson-client/dist/topojson-client.min.js': 'https://unpkg.com/topojson-client@3/dist/topojson-client.min.js'
}


def ensure_clean_dist():
    if DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir(parents=True, exist_ok=True)


def copy_static():
    shutil.copytree(STATIC, DIST / STATIC.name)


def copy_data():
    (DIST / 'data').mkdir(exist_ok=True)
    for f in DATA.glob('*.json'):
        shutil.copy(f, DIST / 'data' / f.name)


def patch_index_html():
    src = STATIC / 'index.html'
    dst = DIST / 'index.html'
    text = src.read_text(encoding='utf-8')
    # replace node_modules with CDN
    for k, v in CDN_REPLACEMENTS.items():
        text = text.replace(k, v)
    # ensure fetch-mock is loaded before main.js
    text = text.replace('<script src="scripts/main.js"></script>', '<script src="scripts/fetch-mock.js"></script>\n  <script src="scripts/main.js"></script>')
    dst.write_text(text, encoding='utf-8')


def main():
    print('Building static dist in', DIST)
    ensure_clean_dist()
    copy_static()
    copy_data()
    patch_index_html()
    print('Done. Inspect dist/ before publishing to GitHub Pages')


if __name__ == '__main__':
    main()
