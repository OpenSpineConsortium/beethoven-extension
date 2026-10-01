"""Beethoven's icon: three candidate marks drawn in the site's language, at four optical sizes each.

Writes SVG files only (the PNGs come from render_icons.mjs, which rasterises these in Chromium):

  candidates/<name>/<name>-<size>.svg   for name in route, worker, monogram and size in 128, 96, 48, 32, 16
  and, for the chosen mark (WINNER below, refined in worker_final), icon.svg (the 128 master) and icon-<size>.svg

The drawing is laid out on a 16-pixel grid (one toolbar pixel = 6 units of the 96-unit card), because 16 px is the
size that decides whether a mark works. Larger sizes keep the layout and add the detail of the home page diagram
(LEDs, vents, the prompt, the window's dots) with thinner strokes, the way Newsreader's own optical sizes work.

Theme tokens are the site's (openspineconsortium.github.io/assets/css/style.css and hero.css), copied here because
an icon cannot read a stylesheet.

Usage: python -X utf8 make_icons.py [<dir holding Newsreader[opsz,wght].ttf>]
  Without the font directory the monogram candidate is left as it is on disk (it is the only drawing that uses
  the font; its letter is stored as outlines, so no SVG here needs a font to display).
"""
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))

# --- site tokens (style.css :root, hero.css) ---
PAPER = "#F1EEE3"       # --paper, the page ground
CARD = "#FBFAF4"        # --paper-card
DEEP = "#E7E2D2"        # --paper-deep
INK = "#1A1C18"         # --ink
FAINT = "#8C8E82"       # --ink-faint
TEAL = "#0E5F58"        # --teal
TEAL_DEEP = "#0A423D"   # --teal-deep (only in the site's soft shadow)

WINNER = "worker"       # chosen after looking at the three at 16 px (README.md); exported through worker_final

# Each size: canvas px, artwork px (the card's side). Chrome's guidance for the 128 package icon is 96 px of
# artwork with 16 px of transparent padding per side; 96 keeps the same proportion; the toolbar and list sizes
# (16, 32, 48) use the whole canvas, as Chrome's own small icons do, which also makes the 16-pixel grid scale to
# them by whole numbers (one grid pixel = 1, 2, 3 real pixels), so their edges land on pixels too.
SIZES = {128: 96, 96: 72, 48: 48, 32: 32, 16: 16}
SMALL = (16, 32, 48)


def fmt(v):
    t = ("%.3f" % v).rstrip("0").rstrip(".")
    return "0" if t == "-0" else t


def svg_doc(size, body, defs=""):
    art = SIZES[size]
    pad = 96.0 * (size - art) / 2.0 / art      # padding in card units
    vb = 96.0 + 2 * pad
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" '
        f'viewBox="{fmt(-pad)} {fmt(-pad)} {fmt(vb)} {fmt(vb)}">\n'
        + (f"<defs>{defs}</defs>\n" if defs else "")
        + body
        + "</svg>\n"
    )


def units_per_px(size):
    return 96.0 / SIZES[size]


def card(size):
    """The rounded square: the site's card (paper-card fill, a hairline of ink), with the hero window's soft
    teal-deep shadow at the two large sizes only (at 48 px and below a shadow is a smudge)."""
    u = units_per_px(size)
    sw = u * 1.0                                  # a one-pixel border at every size
    # the hairline is --line (ink at 14 %) on the site; small sizes need it firmer to keep the tile's edge on a
    # white toolbar
    alpha = {128: 0.16, 96: 0.18, 48: 0.24, 32: 0.28, 16: 0.34}[size]
    r = 18.0
    defs = ""
    filt = ""
    if size >= 96:
        defs = (
            '<filter id="sh" x="-20%" y="-20%" width="140%" height="150%">'
            f'<feDropShadow dx="0" dy="{fmt(3 * u)}" stdDeviation="{fmt(3.5 * u)}" flood-color="{TEAL_DEEP}" flood-opacity=".18"/>'
            "</filter>"
        )
        filt = ' filter="url(#sh)"'
    body = (
        f'<rect x="{fmt(sw/2)}" y="{fmt(sw/2)}" width="{fmt(96-sw)}" height="{fmt(96-sw)}" rx="{fmt(r - sw/2)}" '
        f'fill="{CARD}" stroke="{INK}" stroke-opacity="{alpha}" stroke-width="{fmt(sw)}"{filt}/>\n'
    )
    return defs, body


# ---------------------------------------------------------------- candidate 1: route
def route(size):
    """The diagram in miniature: the claude.ai window, the teal arrow leaving its port, the rack."""
    u = units_per_px(size)
    big = size >= 96
    sw = 2.4 if size == 128 else (2.2 * u / 1.333 if size == 96 else u)   # ink line: thin at 128, 1 px small
    defs, body = card(size)
    # window: grid px x 2..9, y 4..11 (units = px * 6)
    wx, wy, ww, wh = 12, 24, 42, 42
    bar = 10 if big else 12
    body += f'<rect x="{fmt(wx)}" y="{fmt(wy)}" width="{ww}" height="{wh}" rx="{fmt(5 if big else 4)}" fill="{CARD}" stroke="{INK}" stroke-width="{fmt(sw)}"/>\n'
    body += f'<path d="M{fmt(wx+sw/2)},{fmt(wy+bar)} V{fmt(wy+5)} a{fmt(5-sw/2)},{fmt(5-sw/2)} 0 0 1 {fmt(5-sw/2)},{fmt(-(5-sw/2))} H{fmt(wx+ww-5)} a{fmt(5-sw/2)},{fmt(5-sw/2)} 0 0 1 {fmt(5-sw/2)},{fmt(5-sw/2)} V{fmt(wy+bar)} Z" fill="{DEEP}"/>\n'
    body += f'<line x1="{fmt(wx)}" y1="{fmt(wy+bar)}" x2="{fmt(wx+ww)}" y2="{fmt(wy+bar)}" stroke="{INK}" stroke-opacity=".35" stroke-width="{fmt(sw*0.6 if big else u)}"/>\n'
    if big:
        for i in range(3):
            body += f'<circle cx="{fmt(wx+7+i*5.5)}" cy="{fmt(wy+5)}" r="1.7" fill="{INK}" fill-opacity=".22"/>\n'
        # the conversation, as the hero draws it: a teal avatar and two lines
        body += f'<circle cx="{wx+10}" cy="{wy+20}" r="3" fill="{TEAL}"/>\n'
        body += f'<rect x="{wx+16}" y="{wy+18.5}" width="20" height="3" rx="1.5" fill="{INK}" fill-opacity=".12"/>\n'
        body += f'<rect x="{wx+16}" y="{wy+26}" width="14" height="3" rx="1.5" fill="{INK}" fill-opacity=".12"/>\n'
    # rack: grid x 11..15 → units 66..90 ; y 3..13
    rx0, ry0, rw, rh = 64, 18, 22, 60
    body += f'<rect x="{rx0}" y="{ry0}" width="{rw}" height="{rh}" rx="{fmt(3 if big else 2)}" fill="{CARD}" stroke="{INK}" stroke-width="{fmt(sw)}"/>\n'
    uy = [ry0 + 8, ry0 + 26, ry0 + 44]
    for i, y in enumerate(uy):
        me = i == 1
        if big:
            body += f'<rect x="{rx0+4}" y="{y}" width="{rw-8}" height="10" rx="2" fill="{TEAL if me else INK}" fill-opacity="{".12" if me else ".06"}" stroke="{TEAL if me else INK}" stroke-opacity="{1 if me else .2}" stroke-width="{fmt(1.6 if me else 1)}"/>\n'
            body += f'<circle cx="{rx0+8}" cy="{y+5}" r="1.5" fill="{TEAL if me else FAINT}"/>\n'
        else:
            body += f'<rect x="{rx0+6}" y="{y}" width="{rw-12}" height="{fmt(u*1.5)}" fill="{TEAL if me else INK}" fill-opacity="{1 if me else .3}"/>\n'
    # the arrow: from the window's port to the highlighted unit, teal, with the hero's open chevron head
    ay = uy[1] + (5 if big else u * 0.75)
    hw = sw * 0.9 if big else u
    body += f'<path d="M{wx+ww},{fmt(ay)} H{rx0-3}" fill="none" stroke="{TEAL}" stroke-width="{fmt(hw)}" stroke-linecap="round"/>\n'
    body += f'<path d="M{fmt(rx0-8)},{fmt(ay-5)} L{rx0-3},{fmt(ay)} L{fmt(rx0-8)},{fmt(ay+5)}" fill="none" stroke="{TEAL}" stroke-width="{fmt(hw)}" stroke-linecap="round" stroke-linejoin="round"/>\n'
    if big:
        body += f'<circle cx="{wx+ww}" cy="{fmt(ay)}" r="3.2" fill="{CARD}" stroke="{TEAL}" stroke-width="1.8"/>\n'
    return svg_doc(size, body, defs)


# ---------------------------------------------------------------- candidate 2: worker
def worker(size):
    """The rack alone, with the one unit the site picks out in teal: your Claude Code worker, its prompt lit."""
    u = units_per_px(size)
    big = size >= 96
    defs, body = card(size)
    if big:
        sw = 2.6 if size == 128 else 2.6 * u / 1.333 * 0.75
        x0, y0, w, h = 24, 14, 48, 64
        body += f'<rect x="{x0}" y="{y0}" width="{w}" height="{h}" rx="5" fill="{CARD}" stroke="{INK}" stroke-width="{fmt(sw)}"/>\n'
        for fx in (x0 + 5, x0 + w - 11):
            body += f'<rect x="{fx}" y="{y0+h}" width="6" height="4" rx="1.2" fill="{INK}"/>\n'
        uh, gap = 14, 4
        top = y0 + 7
        for i in range(3):
            y = top + i * (uh + gap)
            me = i == 1
            body += (
                f'<rect x="{x0+6}" y="{y}" width="{w-12}" height="{uh}" rx="3" '
                f'fill="{TEAL if me else PAPER}" fill-opacity="{".1" if me else "1"}" '
                f'stroke="{TEAL if me else INK}" stroke-opacity="{1 if me else .18}" stroke-width="{fmt(2 if me else 1.2)}"/>\n'
            )
            cy = y + uh / 2
            body += f'<circle cx="{x0+11}" cy="{fmt(cy)}" r="1.9" fill="{TEAL if me else FAINT}" fill-opacity="{1 if me else .6}"/>\n'
            if me:
                body += (
                    f'<path d="M{x0+17},{fmt(cy-3.2)} l3.2,3.2 l-3.2,3.2 M{x0+23},{fmt(cy+3.2)} h5" fill="none" '
                    f'stroke="{TEAL}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>\n'
                )
            for k in range(3):
                vx = x0 + w - 10 - k * 4.5
                body += f'<line x1="{fmt(vx)}" y1="{fmt(cy-3)}" x2="{fmt(vx)}" y2="{fmt(cy+3)}" stroke="{INK}" stroke-opacity=".2" stroke-width="1.3" stroke-linecap="round"/>\n'
    else:
        # snapped to the 16-pixel grid (p = one grid pixel = 6 units): rack outline on grid 4..12 x 2..14, a line
        # of one grid pixel (two real pixels at 48, where a three-pixel line is clumsy); three 2-px units, the
        # middle one teal; two feet
        p = 6.0
        sw = p if size < 48 else 2 * u
        body += f'<rect x="{fmt(4*p + sw/2)}" y="{fmt(2*p + sw/2)}" width="{fmt(8*p - sw)}" height="{fmt(12*p - sw)}" rx="{fmt(p*0.6)}" fill="{CARD}" stroke="{INK}" stroke-width="{fmt(sw)}"/>\n'
        for i, row in enumerate((4, 7, 10)):
            me = i == 1
            body += f'<rect x="{fmt(6*p)}" y="{fmt(row*p)}" width="{fmt(4*p)}" height="{fmt(2*p)}" fill="{TEAL if me else INK}" fill-opacity="{1 if me else .22}"/>\n'
        for fx in (5, 10):
            body += f'<rect x="{fmt(fx*p)}" y="{fmt(14*p)}" width="{fmt(p)}" height="{fmt(p*0.8)}" fill="{INK}"/>\n'
    return svg_doc(size, body, defs)


# ---------------------------------------------------------------- the chosen mark, refined
def worker_final(size, solid=True):
    """The worker candidate, refined after the comparison: one geometry for every size (the 16-pixel grid, one grid
    pixel = 6 units), so the store icon and the toolbar icon are the same rack; every edge on a whole pixel at 128,
    48, 32 and 16. With solid=True the worker's unit is solid teal at every size, as the toolbar sizes need it to
    be; solid=False keeps the hero's light teal with a teal outline at 128 and 96."""
    u = units_per_px(size)
    big = size >= 96
    defs, body = card(size)
    p = 6.0
    # rack: outer box grid 4..12 x 2..14 = units 24..72 x 12..84; the line sits inside that box
    sw = {128: 3.0, 96: 3.0, 48: 4.0, 32: 6.0, 16: 6.0}[size]        # 3, 2.25, 2, 2 and 1 px
    rr = 5.0 if big else p * 0.6
    body += (
        f'<rect x="{fmt(24 + sw/2)}" y="{fmt(12 + sw/2)}" width="{fmt(48 - sw)}" height="{fmt(72 - sw)}" '
        f'rx="{fmt(rr - sw/2)}" fill="{CARD}" stroke="{INK}" stroke-width="{fmt(sw)}"/>\n'
    )
    # feet: grid columns 5 and 10, row 14
    fh = {128: 4.0, 96: 4.0, 48: 4.0, 32: 6.0, 16: 4.8}[size]        # whole pixels at 128, 48 and 32
    for fx in (30, 60):
        body += f'<rect x="{fx}" y="84" width="6" height="{fmt(fh)}" rx="{fmt(1.2 if big else 0)}" fill="{INK}"/>\n'
    rows = (24, 42, 60)                                 # grid rows 4, 7, 10; each unit two grid pixels tall
    if not big:
        for i, y in enumerate(rows):
            me = i == 1
            body += f'<rect x="36" y="{y}" width="24" height="12" fill="{TEAL if me else INK}" fill-opacity="{1 if me else .22}"/>\n'
        return svg_doc(size, body, defs)
    # 128 and 96: the hero's units, each with its LED and vents; the worker's unit with its prompt
    sx0, sx1 = 24 + sw + 4, 72 - sw - 4                 # units inset 4 inside the rack's line
    for i, y in enumerate(rows):
        me = i == 1
        if me and solid:
            body += f'<rect x="{fmt(sx0)}" y="{y}" width="{fmt(sx1 - sx0)}" height="12" rx="2.5" fill="{TEAL}"/>\n'
            fg, fg_op = CARD, 1
        elif me:
            body += f'<rect x="{fmt(sx0 + 0.75)}" y="{y + 0.75}" width="{fmt(sx1 - sx0 - 1.5)}" height="10.5" rx="2.5" fill="{TEAL}" fill-opacity=".1" stroke="{TEAL}" stroke-width="1.5"/>\n'
            fg, fg_op = TEAL, 1
        else:
            body += f'<rect x="{fmt(sx0 + 0.5)}" y="{y + 0.5}" width="{fmt(sx1 - sx0 - 1)}" height="11" rx="2.5" fill="{PAPER}" stroke="{INK}" stroke-opacity=".2" stroke-width="1"/>\n'
            fg, fg_op = FAINT, .7
        cy = y + 6
        body += f'<circle cx="{fmt(sx0 + 5)}" cy="{cy}" r="1.75" fill="{fg}" fill-opacity="{fg_op}"/>\n'
        if me:   # the prompt, as the hero draws it: a chevron and an underscore
            px = sx0 + 9
            body += (
                f'<path d="M{fmt(px)},{cy - 3} l3,3 l-3,3 M{fmt(px + 5)},{cy + 3} h4" fill="none" stroke="{fg}" '
                f'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>\n'
            )
        for k in range(3):
            vx = sx1 - 4.5 - k * 4
            body += (
                f'<line x1="{fmt(vx)}" y1="{cy - 2.5}" x2="{fmt(vx)}" y2="{cy + 2.5}" stroke="{CARD if (me and solid) else INK}" '
                f'stroke-opacity="{.55 if (me and solid) else .22}" stroke-width="1" stroke-linecap="round"/>\n'
            )
    return svg_doc(size, body, defs)


# ---------------------------------------------------------------- candidate 3: monogram
GLYPHS = {}


def glyph(fontdir, wght, opsz):
    key = (wght, opsz)
    if key not in GLYPHS:
        out = subprocess.run(
            [sys.executable, "-X", "utf8", os.path.join(HERE, "glyph.py"),
             os.path.join(fontdir, "Newsreader[opsz,wght].ttf"), "B", str(wght), str(opsz)],
            check=True, capture_output=True, text=True,
        ).stdout
        GLYPHS[key] = json.loads(out)
    return GLYPHS[key]


def monogram(size, fontdir):
    """A Newsreader B, the site's display face at its display weight, in ink; and one teal dot, the dot that runs
    along the hero's arrows (and the full stop of "Your grid.")."""
    u = units_per_px(size)
    defs, body = card(size)
    # optical sizes: at 16 and 32 px a lower opsz (sturdier hairlines, more open counters) and more weight
    wght, opsz = {128: (500, 72), 96: (500, 60), 48: (540, 36), 32: (580, 18), 16: (640, 10)}[size]
    g = glyph(fontdir, wght, opsz)
    x0, y0, x1, y1 = g["bbox"]           # y-down, baseline at 0; cap height = -y0
    cap = {128: 50.0, 96: 50.0, 48: 52.0, 32: 54.0, 16: 60.0}[size]   # cap height in card units
    s = cap / (-y0)
    gw = (x1 - x0) * s
    dot_r = {128: 5.2, 96: 5.2, 48: 5.6, 32: 6.0, 16: 6.6}[size]
    gap = {128: 5.0, 96: 5.0, 48: 5.0, 32: 4.0, 16: 3.0}[size]
    total = gw + gap + 2 * dot_r
    left = (96 - total) / 2 + 1.0                       # a hair right: the dot is light, the B is heavy
    base = 48 + cap / 2                                 # cap height centred in the card
    if size in SMALL:                                   # snap the baseline and the glyph's left edge to pixels
        base = round(base / u) * u
        left = round(left / u) * u
    tx = left - x0 * s
    body += f'<path transform="translate({fmt(tx)} {fmt(base)}) scale({s:.6f})" d="{g["d"]}" fill="{INK}"/>\n'
    cx = left + gw + gap + dot_r
    cy = base - dot_r
    if size in SMALL:                                   # centre on a pixel corner: a solid 2x2 dot at 16 px
        cx = round(cx / u) * u
        cy = base - u * round(dot_r / u)
    body += f'<circle cx="{fmt(cx)}" cy="{fmt(cy)}" r="{fmt(dot_r)}" fill="{TEAL}"/>\n'
    return svg_doc(size, body, defs)


def main():
    fontdir = sys.argv[1] if len(sys.argv) > 1 else None
    makers = {"route": route, "worker": worker}
    if fontdir:
        makers["monogram"] = lambda s: monogram(s, fontdir)
    for name, fn in makers.items():
        d = os.path.join(HERE, "candidates", name)
        os.makedirs(d, exist_ok=True)
        for size in SIZES:
            with open(os.path.join(d, f"{name}-{size}.svg"), "w", encoding="utf-8", newline="\n") as f:
                f.write(fn(size))
    if WINNER is None:
        print("wrote candidates; no winner chosen yet")
        return
    win = {"worker": worker_final}[WINNER]
    for size in SIZES:
        name = "icon.svg" if size == 128 else f"icon-{size}.svg"
        with open(os.path.join(HERE, name), "w", encoding="utf-8", newline="\n") as f:
            f.write(win(size))
    print("wrote candidates and", WINNER, "as icon.svg")


if __name__ == "__main__":
    main()
