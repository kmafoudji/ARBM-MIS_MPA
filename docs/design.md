# Visual design

The frontend follows the LLF (Lives and Livelihoods Fund) visual identity: a
charcoal-and-white base, one green accent, fixed colours per sector and per
status, a single typeface, flat cards. The tokens below are the ones defined in
`frontend/src/styles.css`; page-level styles are expected to use them rather
than literal values.

## Colour

### Palette

| Token | Value | Role |
|---|---|---|
| `--ink` | `#2B2B2B` | Charcoal — all body text, titles, structure. Never pure black. |
| `--ink-soft`, `--muted`, `--subtle` | `#545454`, `#7E7E7E`, `#A7A7A7` | Charcoal tonal scale for secondary text and captions. |
| `--lime` | `#0EB584` | Growth Green — the one default accent: primary actions, highlights, active state. |
| `--lime-dark`, `--lime-darker` | `#0C9A71`, `#09815F` | Hover and contrast steps of the accent. |
| `--lime-soft`, `--lime-pale` | `#C2F0E2`, `#EFFFFA` | Light tints of the accent for fills. |
| `--paper` | `#FFFFFF` | Page background. |
| `--surface`, `--surface-2` | `#FAFAFA`, `#F7F6F6` | Card fill; tinted panel. |
| `--rule`, `--rule-soft` | `#EFEFEF`, `#F7F6F6` | Card and table borders. |
| `--sidebar` | `#2B2B2B` | Dark navigation background. |
| `--navy` | `#0089C5` | Hyperlinks. |

### Sectors (fixed mapping)

| Sector | Token | Value | Tint |
|---|---|---|---|
| Primary healthcare | `--sec-health` | `#FB563B` coral | `--sec-health-bg` |
| Agriculture | `--sec-agri` | `#0EB584` green | `--sec-agri-bg` |
| Social infrastructure | `--sec-infra` | `#F49D07` yellow | `--sec-infra-bg` |
| Gender equality | `--sec-women` | `#7E46B8` purple | `--sec-women-bg` |
| Climate adaptation | `--sec-climate` | `#0089C5` blue | `--sec-climate-bg` |

### Status (fixed mapping)

| Meaning | Token | Value |
|---|---|---|
| Good | `--green` / `--green-soft` | `#0EB584` |
| Mixed | `--blue` / `--blue-soft` | `#0089C5` |
| Requires attention | `--orange` / `--orange-soft` | `#F49D07` |
| Problematic | `--rose` / `--rose-soft` | `#FB563B` |
| Cross-cutting | `--violet` / `--violet-soft` | `#7E46B8` |

### Rules

- Default to white background, charcoal text, **one** accent. Add other accents
  only when they carry meaning — a sector, a status, a category.
- Multi-value data uses the LLF tonal scales (six levels per hue, the `-soft`
  and `-pale` tokens being the light ends); do not invent intermediate tints.
- On a dark `--sidebar` background, headings are yellow (`--orange`) and
  secondary text is white.
- Text on a solid accent fill is white and bold.
- No gradients, no cream or beige backgrounds, no colours outside the palette.

## Typography

**One typeface: Inter** (weights 300–700, loaded from Google Fonts in
`index.html`), with `system-ui, sans-serif` as fallback. `--font-display` and
`--font-body` both resolve to it; `--font-mono` (JetBrains Mono) is kept for
code-like values only.

- Titles are sentence case: never all caps, never underlined, no accent line
  beneath. Page titles are light weight by default; bold is for emphasis,
  headers and numbers.
- Body text is small and dense; whitespace and cards do the separating, not
  larger type.
- Line height about 1.05 for titles, 1.15–1.3 for body.
- Left-align everything except numbers inside circles and stat tiles.

## Shape

| Token | Value | Use |
|---|---|---|
| `--r-1` … `--r-4` | 4, 8, 8, 12 px | Corner radii: small controls → cards |
| `--s-0` … `--s-7` | 4, 8, 12, 16, 24, 32, 48, 64 px | Spacing scale |
| `--shadow-1` … `--shadow-3` | `none` | **No drop shadows anywhere.** The tokens exist so that legacy `box-shadow: var(--shadow-*)` declarations resolve to nothing. |

Cards are flat: a `--surface` fill and a `--rule` border, aligned edges, no
single-edge borders, no vertical colour stripes, no header or footer bars.

## Don't

- No shadows, gradients, bevels, 3-D.
- No colours outside the palette, including off-palette greys.
- No font other than Inter; no italic titles; no all caps.
- No clip art, stock icons, emoji or illustrations; the LLF icon set and
  Unicode glyphs are the only decorative devices.
- Never a dark card and an accent card side by side.

## Assets

Logos ship in `frontend/public/logos/` (`llf/`, `donors/`, `agencies/`,
`sdg/`) with their origin recorded in `PROVENANCE.md` there. The favicon set
is the LLF mark at 32, 180 and 512 px.

## Source

The palette, tonal scales, type rules and do/don't list are those of the LLF
presentation template; this page states them as they apply to the web
frontend. Where a page still carries literal hex values or the lime-era
`rgba(164,197,63,…)`, the token is the correct replacement.
