# Beethoven's icon

The rack from the home page diagram, with the one unit the diagram picks out in teal and labels "your Claude
Code worker", its prompt lit. It sits on a cream rounded card, drawn in ink with one teal accent, using the
site's own tokens (`assets/css/style.css`, `hero.css`). The icon names nobody and uses no font.

## Files

| File | What it is |
|---|---|
| `icon.svg` | The master: a 128 px canvas with 96 px of artwork and 16 px of transparent padding per side (Chrome's convention for the 128 package icon) |
| `icon-96.svg`, `icon-48.svg`, `icon-32.svg`, `icon-16.svg` | Optical sizes. 48, 32 and 16 fill the canvas and are snapped to a 16-pixel grid, so every edge lands on a whole pixel |
| `icon*.png` | The SVGs rendered by Chromium at their exact sizes, with transparency |
| `store-icon-128.png` | The 128 flattened on the site's cream (#F1EEE3). Not used since 2026-09-30: the dashboard's Store icon field takes `icon.png`, whose padding is transparent (flattened, it showed a cream square around the card on the store's white page) |
| `../../../public/icon/{16,32,48,96,128}.png` | The package icons the manifest names (copies of the PNGs above) |
| `candidates/` | The three marks that were compared: `route`, `worker`, `monogram` |
| `compare-16px.png` | The comparison sheet: each mark at 128, 48 and 32, at 16 on a light and a dark toolbar, beside the site's mark, and magnified 8x |

## Why this one

Three marks were drawn and looked at, at 16 px in particular:

- **route** (the window, the arrow, the rack) turned into two grey boxes at 16 px.
- **monogram** (a Newsreader B with the teal dot that runs along the hero's arrows) was the finest at 128,
  but at 16 px its serifs and counters went grey.
- **worker** stayed sharp at 16 px: a cabinet with a solid teal unit. Like the site's mark, it is a line
  drawing in the site's ink and teal, and it is the object in the front page diagram that the extension
  actually starts.

The chosen mark (`worker_final` in `make_icons.py`) puts the worker candidate on one grid at every size. Its
unit is solid teal at every size, rather than the hero's light teal, because a light teal disappears at
16 px and the store icon should match the toolbar.

## Regenerate

```
python -X utf8 make_icons.py [<dir with Newsreader[opsz,wght].ttf>]
node render_icons.mjs <playwright package dir> <font dir> <scratch dir>
python -X utf8 export_icons.py
```

Only the monogram candidate uses the font, and it stores its letter as outlines. Without the font directory,
the monogram candidate is left as it is. Newsreader is licensed under the SIL Open Font License 1.1:
https://github.com/google/fonts/tree/main/ofl/newsreader
