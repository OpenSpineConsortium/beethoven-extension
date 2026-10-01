"""Outline one Newsreader glyph as SVG path data, so an icon carries the letter as a shape and needs no font.

Usage: python -X utf8 glyph.py <font.ttf> <char> <wght> <opsz>
Prints JSON: {"d": path in font units with y pointing down and the baseline at y=0, "bbox": [xMin, yMin, xMax, yMax]
(same y-down convention), "advance": advance width, "upem": units per em}.

The font is Newsreader (SIL Open Font License 1.1), the site's display face, from
https://github.com/google/fonts/tree/main/ofl/newsreader ; the variable font is pinned to one weight and optical
size with fontTools' instancer before the outline is read.
"""
import json
import sys

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer


def outline(path, char, wght, opsz):
    font = TTFont(path)
    inst = instancer.instantiateVariableFont(font, {"wght": float(wght), "opsz": float(opsz)})
    cmap = inst.getBestCmap()
    name = cmap[ord(char)]
    gs = inst.getGlyphSet()
    glyph = gs[name]
    svg = SVGPathPen(gs, ntos=lambda v: ("%.2f" % v).rstrip("0").rstrip("."))
    glyph.draw(TransformPen(svg, (1, 0, 0, -1, 0, 0)))  # flip y: SVG y grows downward
    bp = BoundsPen(gs)
    glyph.draw(bp)
    x0, y0, x1, y1 = bp.bounds
    return {
        "d": svg.getCommands(),
        "bbox": [x0, -y1, x1, -y0],
        "advance": glyph.width,
        "upem": inst["head"].unitsPerEm,
    }


if __name__ == "__main__":
    f, ch, w, o = sys.argv[1:5]
    print(json.dumps(outline(f, ch, w, o)))
