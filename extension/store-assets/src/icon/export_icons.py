"""Export the chosen icon: the package icons the manifest names, and the store icon.

Run after make_icons.py and render_icons.mjs. Writes
  extension/public/icon/{16,32,48,96,128}.png   from icon-16.png ... icon.png here (RGBA: the 128 and 96 keep
                                                Chrome's transparent padding round the card; the small sizes have
                                                transparent rounded corners)
  store-icon-128.png (here)                     the 128 flattened on the site's cream (#F1EEE3), 24-bit RGB, no alpha,
                                                for the dashboard's "Store icon" field
and checks every size and colour mode.
"""
import os
import shutil

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
EXT = os.path.normpath(os.path.join(HERE, "..", "..", ".."))
PUBLIC = os.path.join(EXT, "public", "icon")
PAPER = (0xF1, 0xEE, 0xE3)          # --paper

SRC = {16: "icon-16.png", 32: "icon-32.png", 48: "icon-48.png", 96: "icon-96.png", 128: "icon.png"}

for size, name in SRC.items():
    src = os.path.join(HERE, name)
    im = Image.open(src)
    assert im.size == (size, size), (name, im.size)
    assert im.mode == "RGBA", (name, im.mode)
    shutil.copyfile(src, os.path.join(PUBLIC, f"{size}.png"))

icon = Image.open(os.path.join(HERE, "icon.png")).convert("RGBA")
ground = Image.new("RGBA", icon.size, PAPER + (255,))
flat = Image.alpha_composite(ground, icon).convert("RGB")
out = os.path.join(HERE, "store-icon-128.png")
flat.save(out, optimize=True)

chk = Image.open(out)
assert chk.size == (128, 128) and chk.mode == "RGB", (chk.size, chk.mode)
for size in SRC:
    p = os.path.join(PUBLIC, f"{size}.png")
    im = Image.open(p)
    print(f"public/icon/{size}.png  {im.size[0]}x{im.size[1]} {im.mode}  {os.path.getsize(p)} bytes")
print(f"src/icon/store-icon-128.png  {chk.size[0]}x{chk.size[1]} {chk.mode} (24-bit, no alpha)  {os.path.getsize(out)} bytes")
