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
| `--ground` | `#ECEBE8` | The ground the content column sits on — one neutral step below the cards, so a white card reads as raised. Same value as `--rule`. |
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

Each sector hue also has a `--sec-*-pale` token holding the L5 step of its
tonal scale (`#FDF3F3`, `#EFFFFA`, `#FFFAF0`, `#F7F0FF`, `#DBF4FF`), for large
tinted surfaces such as the catalogue's pillar cards. Use it rather than mixing
a tint of your own.

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
| `--shadow-1` … `--shadow-3` | `none` | **No resting shadows.** The tokens exist so that legacy `box-shadow: var(--shadow-*)` declarations resolve to nothing. |
| `--shadow-hover` | `0 4px 14px rgba(43,43,43,.10)` | The one shadow: a surface that is itself a control lifts **under the pointer**. Never on a resting surface. |

Cards rest flat: a `--surface` or `--paper` fill and a `--rule` border, aligned
edges, no bevels. What a card may carry is set out below.

## Colour as structure

Adopted 10 September 2026, generalised from the Indicator Catalogue after it
was rebuilt from the LLF indicator-library mockup (`.dev-notes/style/mockups/`).
Colour here is never decoration: each device below states *which* attribute of
the data it is showing, and takes that attribute's fixed hue.

- **Section band** (`.section-bar`): the heading of a run of rows, filled with
  the colour that names the run — in the catalogue the result level (impact
  purple, outcome green, output blue, measure types charcoal). Text on it is
  white and bold.
- **Left stripe**: a 4 px coloured left edge on a row or card, carrying a
  second attribute — in the catalogue the sector, through the pillar mapping.
  One stripe at most; if there is nothing to say, the edge stays `--rule`.
- **Tinted selector cards** (`.cat-cards` in the catalogue): a card per choice,
  filled with the L5 step of its hue (`--sec-*-pale`) and outlined in the hue
  when active. Never a mixed tint of your own.
- **Dark panel headers**: the header of a drawer, a modal (`.modal-header`) or
  a table (`.table th`) is `--sidebar` charcoal with white text; a monospaced
  reference on it is Growth Green. The dark ground is no longer the sidebar's
  alone.
- **Hover elevation**: `--shadow-hover` on rows and on `.card-click`.

A layer that floats above the page — a drawer, a popover, a map tooltip —
may carry a soft shadow of its own: it is separating a layer, not decorating
a card. Nothing that sits *in* the page does.

## Don't

- No resting shadows, gradients, bevels, 3-D.
- No colours outside the palette, including off-palette greys.
- No colour that means nothing: every fill above names an attribute of the data.
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
