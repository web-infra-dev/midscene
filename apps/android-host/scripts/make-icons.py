#!/usr/bin/env python3
"""Regenerate the launcher icon set from the studio mark.

The launcher icon and the console's title-bar tile are the same art, so they are derived
from one source (`drawable/ic_brand_mark.png`, the tight crop) with one ratio: the mark
covers ~0.75 of the tile and the rest is brand blue. The title bar draws a 24dp mark on a
30dp brand-blue tile and measures 0.75 edge to edge, which is what these assets copy.

Two shapes come out of it:

* `drawable/ic_launcher_foreground.png` — the adaptive icon's foreground layer. It lives on
  the 108dp canvas, of which a launcher only reveals the central ~72dp, so the mark is
  placed at ADAPTIVE_MARK_BOX of the *canvas*. Launchers differ in how much they reveal,
  so the value was measured rather than trusted: install, screenshot the app drawer, and
  compare the mark's outline against the visible tile (`--mark-box` re-runs that loop).
* `mipmap-*/ic_launcher.png` — the legacy icons (pre-API-26 launchers and store tooling),
  drawn as a brand-blue rounded square with the mark at the same 0.8 of the tile the
  console tile uses, and the same 1/3 corner radius as `MaterialTheme.shapes.small`.

Needs Pillow: `python3 -m pip install pillow`.
"""

import argparse
import pathlib
import sys

try:
    from PIL import Image, ImageDraw
except ImportError:  # pragma: no cover - the message is the point
    sys.exit('Pillow is required: python3 -m pip install pillow')

HOST_ROOT = pathlib.Path(__file__).resolve().parent.parent
RES = HOST_ROOT / 'app/src/main/res'
MARK = RES / 'drawable/ic_brand_mark.png'
FOREGROUND = RES / 'drawable/ic_launcher_foreground.png'

BRAND = (0x19, 0x79, 0xFF, 0xFF)
CANVAS = 1024
# Mark size on the adaptive canvas. Measured on a device: a launcher reveals ~0.67 of the
# canvas (the 72dp of 108dp the spec allows), so 0.53 here renders the mark at 0.75 of the
# visible tile — the ratio the console header tile has. Re-verify by measuring a screenshot.
ADAPTIVE_MARK_BOX = 0.53
# The mark inside the tile: 24dp of a 30dp tile in the console header.
TILE_MARK_RATIO = 0.80
# Corner radius of the console tile: MaterialTheme.shapes.small, 10dp of 30dp.
TILE_RADIUS_RATIO = 10 / 30
LEGACY_SIZES = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}


def mark_layer(size, box_ratio):
    """The mark, scaled so its ink covers `box_ratio` of a transparent `size` square."""
    mark = Image.open(MARK).convert('RGBA')
    side = round(size * box_ratio)
    ink = round(side * 0.943)  # the crop leaves ~3% margin on each side
    scaled = mark.resize((side, side), Image.LANCZOS)
    layer = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    offset = (size - side) // 2
    layer.paste(scaled, (offset, offset), scaled)
    print(f'  mark ink {ink}px of {size}px canvas ({ink / size:.2f})')
    return layer


def write_foreground(mark_box):
    layer = mark_layer(CANVAS, mark_box)
    layer.save(FOREGROUND)
    print(f'  {FOREGROUND.relative_to(HOST_ROOT)} ({CANVAS}x{CANVAS})')


def write_legacy():
    for density, size in LEGACY_SIZES.items():
        tile = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        draw = ImageDraw.Draw(tile)
        radius = round(size * TILE_RADIUS_RATIO)
        draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=BRAND)
        mark = mark_layer(size, TILE_MARK_RATIO)
        tile = Image.alpha_composite(tile, mark)
        out = RES / f'mipmap-{density}/ic_launcher.png'
        tile.save(out)
        print(f'  {out.relative_to(HOST_ROOT)} ({size}x{size})')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        '--mark-box',
        type=float,
        default=ADAPTIVE_MARK_BOX,
        help='mark size as a fraction of the adaptive canvas (default: %(default)s)',
    )
    args = parser.parse_args()

    if not MARK.is_file():
        sys.exit(f'mark not found at {MARK}')
    print(f'source mark: {MARK.relative_to(HOST_ROOT)}')
    print(f'adaptive foreground (mark box {args.mark_box} of the canvas):')
    write_foreground(args.mark_box)
    print('legacy icons (brand tile, mark at '
          f'{TILE_MARK_RATIO} of the tile):')
    write_legacy()


if __name__ == '__main__':
    main()
