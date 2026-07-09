# ZipJeweler Instagram slide templates

Branded 4:5 (1080×1350) Instagram slides on the ZipJeweler Design System, for the
three app-centric weekly pillars. Recreated from the design handoff.

| Template | Pillar | Screenshots needed? | Status |
|---|---|---|---|
| `tip-card.html` | Thursday — Educational tip | No (numbers as content) | ✅ Ready |
| `feature-spotlight/*` | Wednesday — Feature spotlight (carousel) | Yes | ⏳ Planned |
| `workflow/*` | Saturday — Workflow walkthrough (carousel) | Yes | ⏳ Planned |

## Render

```sh
npm install                       # installs playwright-core (Chromium is pre-provisioned)
node templates/render.mjs templates/tip-card.html data.json out.png
```

`data.json` supplies the `{{tokens}}` in the template (values are HTML-escaped).
Output is always 1080×1350 (captured from `.ig-frame`). Chromium is found via
`CHROMIUM_PATH` or the default Playwright path.

### tip-card.html tokens
`badgeNumber, eyebrow, headline, body, row1label, row1value, row2label,
row2value, row3label, row3value, handle, cta`

## Design tokens (locked)
Canvas `#F6F6F5` · Surface `#FFFFFF` · Border `#E1E1DF` · Text `#202224` ·
Text-secondary `#5B5E63` · Action `#38566B` · Champagne `#B49A6C` ·
Champagne-tint `#F5F1E8` · Champagne-text `#7A6238`. Inter 400/500/600 (UI),
Source Serif 4 400/600 (hero headlines + step numerals only). 90/8/2 color rule.

## Screenshots (Wed/Sat carousels)
The feature-spotlight and workflow carousels drop **real app captures** into
framed slots. Commit those PNGs under `media/` and reference them when rendering;
do not fabricate UI.
