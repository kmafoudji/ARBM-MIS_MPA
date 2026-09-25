# LLF Presentation Design Specification

Design system extracted from `LLF_TEMPLATE_STYLE.pptx` (Lives and Livelihoods Fund, 54 slides).
This document is written so that an LLM can generate new slides that are visually indistinguishable from the official template. Follow every rule unless the user explicitly overrides it.

All measurements are in inches on a **10.0 × 5.625 in** canvas (16:9). Colors are hex without `#` unless shown in a table.

---

## 1. Canvas, grid and margins

| Property | Value |
|---|---|
| Slide size | 10.0 × 5.625 in (`LAYOUT_16x9` in pptxgenjs, `9144000 × 5143500` EMU) |
| Safe area (left / right) | x = 0.36 in → 9.64 in (content width **9.28 in**) |
| Safe area (top) | y = 0.34 in |
| Safe area (bottom, content) | y ≤ 5.05 in (footer sits below) |
| Footer baseline | y = 5.25 in, height 0.30 in |
| Column gutter | 0.13 – 0.15 in between cards/columns |
| Row gap between stacked rows | 0.05 – 0.06 in (list rows), 0.15 in (card rows) |

**Never** place text, images or shapes inside the outer 0.36 in margin, except full-bleed photographs and full-bleed dark backgrounds (cover, section dividers).

### Standard column widths (content width 9.28 in)
- 2 columns: 4.54 in each, gutter 0.16 in
- 3 columns: 3.00 in each, gutter 0.13 in
- 4 columns: 2.22 in each, gutter 0.13 in
- 6 columns (swatches): 1.42 in each, gutter 0.15 in
- Text + photo split: text area 5.78 in, photo 3.39 in (photo right, x = 6.25)
- Section divider with photo: photo covers the right half (x = 5.0 → 10.0, full height)

### Footer (every light content slide)
- Left: `Lives and Livelihoods Fund | Presentation Template` — replace the part after `|` with the deck name. Font Inter 7 pt, `2B2B2B`; the deck name after `|` is **bold**. Position x = 0.26, y = 5.25, w = 3.38.
- Right: slide number, Inter 7 pt, light gray `A7A7A7`, right-aligned, x = 7.51, y = 5.25, w = 2.25.
- No footer on: cover, closing slide, section dividers, dark full-bleed slides.
- No divider line above the footer. No logos in the footer of content slides.

---

## 2. Color system

### 2.1 Core palette (six colors)

| Name | Hex | Role |
|---|---|---|
| Charcoal Gray | `2B2B2B` | Primary neutral. All body text, titles, dark backgrounds, structure. |
| Growth Green | `0EB584` | Primary brand accent. Default accent for labels, highlights, primary cards, agriculture. |
| Coral Red | `FB563B` | Health-related content, social priorities, warmth, "problematic" status. |
| Solar Yellow | `F49D07` | Optimism, initiative, social infrastructure, cover/section title text on dark, "attention" status. |
| Unity Purple | `7E46B8` | Inclusion, gender equality, cross-cutting themes. |
| Horizon Blue | `0089C5` | Climate adaptation, sustainability, hyperlinks, "mixed" status. |

Theme mapping (for `.pptx` generators): `dk1 = 2B2B2B`, `lt1 = FFFFFF`, `accent1 = 0EB584`, `accent2 = FB563B`, `accent3 = F39D07`, `accent4 = 7E46B8`, `accent5 = 0089C5`, `hlink = 0089C5`.

### 2.2 Tonal scales (L0 = core, L5 = lightest)

Use these for charts, data visualization, and any layout needing several values of one hue. Never invent intermediate tints.

| Level | Charcoal | Green | Coral | Yellow | Purple | Blue |
|---|---|---|---|---|---|---|
| L0 | `2B2B2B` | `0EB584` | `FB563B` | `F49D07` | `7E46B8` | `0089C5` |
| L1 | `545454` | `3BC49C` | `FB7560` | `F6B036` | `9668C6` | `2C9ED1` |
| L2 | `7E7E7E` | `68D3B3` | `FC9585` | `F8C264` | `AE8AD4` | `58B4DC` |
| L3 | `A7A7A7` | `95E1CB` | `FCB4A9` | `FBD593` | `C7ACE3` | `83C9E8` |
| L4 | `D1D1D1` | `C2F0E2` | `FDD4CE` | `FDE7C1` | `DFCEF1` | `AFDFF3` |
| L5 | `F7F6F6` | `EFFFFA` | `FDF3F3` | `FFFAF0` | `F7F0FF` | `DBF4FF` |

### 2.3 Surface and structural neutrals

| Token | Hex | Use |
|---|---|---|
| `bg.light` | `FFFFFF` | Default slide background |
| `bg.dark` | `2B2B2B` | Cover, closing, section dividers, dark chart card |
| `bg.panel` | `F7F6F6` | Large tinted side panel (e.g., type-specimen right half) |
| `card.fill` | `FAFAFA` | Standard content card |
| `card.border` | `EFEFEF` | Standard card outline |
| `field.fill` | `FCFCFC` | Data entry rows, note boxes |
| `field.border` | `D9D9D9` | Data entry row outline |
| `table.header` | `545454` | Table header row fill |
| `table.band` | `F0F0F0` / `FCFCFC` | Alternating table rows |
| `circle.outline` | `595959` | Outline of numbered circles |
| `text.muted` | `A7A7A7` | Slide numbers, tertiary captions |
| `text.field` | `26323E` | Text inside data entry fields |

### 2.4 Color usage rules
- Default to **white background + charcoal text + one accent (green)**. Add other accents only when they carry meaning (sector, status, category).
- Sector ↔ color mapping is fixed: Primary Healthcare = Coral, Agriculture = Green, Social Infrastructure = Yellow, Gender Equality = Purple, Climate Adaptation = Blue, Fund/Master = Green.
- Status mapping (legends): Good = Green `0EB584`, Mixed = Blue `0089C5`, Requires attention = Yellow `F49D07`, Problematic = Coral `FB563B`.
- Six-category legend order: Green, Blue, Yellow, Coral, Gray `A7A7A7`, Charcoal `2B2B2B`.
- On a dark `2B2B2B` background, titles are **Solar Yellow `F49D07`** and secondary text is white.
- Text on a solid accent card (green/coral/yellow) is white and bold.
- Never use gradients on shapes. Never use cream/beige backgrounds. Never use pure black `000000`.

---

## 3. Typography

**Single typeface: Inter.** Weights used: Light, Regular, Medium, SemiBold, Bold. If Inter is unavailable, fall back to Arial (never a serif).

### 3.1 Official type scale (from the type-specimen slide)

| Level | Font | Size / line height (pt) | Use |
|---|---|---|---|
| H1 | Inter Bold | 36 / 38 | Hero statements, big stat headlines (up to 48 pt on stat slides) |
| H2 | Inter Bold | 24 / 28 | Secondary hero line |
| H3 | Inter Light | 18 / 21 | Lead paragraph / sub-headline |
| H4 | Inter Bold | 12 / 15 | Emphasized sentence, card header |
| P | Inter Regular | 7 / 9 | Body paragraph (dense content slides) |
| P-bold | Inter Bold | 7 / 9 | Attribution names, inline labels |
| P-italic | Inter Italic | 7 / 9 | Project names / captions in attributions |

### 3.2 Applied sizes on content slides (what the template actually uses)

| Element | Font | Size | Color | Notes |
|---|---|---|---|---|
| Slide title (Layout #1/#2/#3) | Inter **Light** | 16 pt | `2B2B2B` | 1–2 lines, left aligned, x = 0.36, y = 0.34, w = 9.31, h = 0.54 |
| Slide title (Layout #4/#5) | Inter **Bold** | 16 pt | `2B2B2B` | followed by an intro line |
| Intro / context line under title | Inter Light | 8 pt | `2B2B2B` | one line max |
| Section-style page header (e.g. "Color Palette") | Inter Bold | 20 pt | `2B2B2B` | used on guideline-type slides |
| Section divider title | Inter Bold | 20 pt | `F49D07` on dark | centered or left-aligned |
| Section divider description | Inter Regular | 12 pt | `FFFFFF` on dark | |
| Cover title | Inter Bold | 30 pt | `F49D07` | |
| Cover subtitle | Inter Light | 12 pt | `FFFFFF` | |
| Closing statement | Inter Bold | 18 pt | `FFFFFF` | |
| Stat headline (e.g. "Building the basics") | Inter Bold | 48 pt | `2B2B2B` | |
| Stat sub-headline | Inter Bold | 16 pt | `2B2B2B` | |
| Big number in stat tile | Inter Medium | 32 pt (48 pt if single tile) | white on accent / `2B2B2B` on light tints | |
| Stat tile caption | Inter Medium | 11 pt | same as number | |
| Card header ("Content Header") | Inter Bold | 10 – 12 pt | `2B2B2B` | |
| Body text inside cards | Inter Regular | 8 pt | `2B2B2B` | line spacing ≈ 1.15 |
| Emphasized body ("Sample Text:" lead-in) | Inter Bold | 8 pt | `2B2B2B` | bold prefix, regular continuation |
| Label pill text | Inter Bold | 12 pt | `FFFFFF` | |
| Sector chip text | Inter Regular | 8 pt | `FFFFFF` | |
| Numbered circle digit | Inter Bold | 10 pt | `2B2B2B` (small 0.32 in) / 6.6 pt (0.26 in) | |
| Agenda circle digit | Inter Regular | 36 pt | `2B2B2B` | 1.07 in circle |
| Agenda item title | Inter Bold | 12 pt | | |
| Agenda time / meta | Inter Regular | 8 pt | | |
| Agenda description | Inter Regular | 7 pt | | |
| Process step title | Inter Bold | 9 – 10 pt | | |
| Data entry field text | Inter Regular | 8 pt | `26323E` | |
| Field name in colored block | Inter Bold | 10 pt | `FFFFFF` | |
| Table header | Inter Bold | 7 pt | `FFFFFF` | |
| Table first column | Inter Bold | 7 pt | `2B2B2B` | |
| Table cells | Inter Light | 7 pt | `2B2B2B` | |
| Note box text | Inter Bold prefix + Regular | 7 pt | `2B2B2B` | |
| Legend items | Inter Regular | 7 pt (label "Legend" bold) | `2B2B2B` | |
| Footer | Inter Regular / Bold | 7 pt | `2B2B2B` | |
| Slide number | Inter Regular | 7 pt | `A7A7A7` | |

### 3.3 Typography rules
- Titles are sentence case, never ALL CAPS, never underlined, never with an accent line beneath.
- Slide titles are **Light** weight by default; bold titles are reserved for Layouts #4/#5 (numbered or chip-led title with intro line) and for hero/stat slides.
- Body text is small (7–8 pt) and dense; compensate with generous whitespace and cards, not with larger fonts. Do not exceed 10 pt for body copy.
- Line height: titles ≈ 1.05, body ≈ 1.15–1.3. Paragraph spacing: one blank line (≈ 8 pt after) between paragraphs.
- Bullets: use `●` (default) or `→` for action-style lists. Never a hyphen. Indent 0.15 in.
- Left align everything except: numbers inside circles (centered), stat tiles (left), dark section titles (centered when no photo).
- Quotes are set in Inter Light with a large green `“` glyph (Inter Bold, ≈ 20 pt, `0EB584`) preceding the text; attribution below in 7 pt (name bold, project regular, country italic).

---

## 4. Shape and component library

### 4.1 Corner radius
- Standard card / panel: `roundRect` with adjust ≈ 4–5 % (`adj = 4500`), visually ≈ 0.08 in radius.
- Small rows / data fields (0.44 in tall): adjust ≈ 13.5 % (`adj = 13548`), i.e., ≈ 0.06 in.
- Pills, chips, legend dots, agenda tracks: fully rounded (`adj = 50000`) or `ellipse`.
- Stat tiles: adjust ≈ 8–9 % (`adj = 8500`).
- Never use square-cornered cards; plain `rect` is only for full-bleed backgrounds, color swatches and photo masks.

### 4.2 Line weights
- Card outline: 0.75 pt (`9525` EMU), color `EFEFEF`.
- Data field outline: 0.75 pt, `D9D9D9`.
- Numbered circle outline: 0.75 pt, `595959`.
- Note box / status card outline: 0.75 – 1 pt in the semantic accent (`0EB584` positive, `F99383` negative, `95E1CB` neutral card).
- Table cell dividers: 1.5 pt (`19050`) **white** lines between cells (cells are filled; borders appear as white gaps).
- Section separator lines on guideline slides: 0.75 pt `D1D1D1`. Do **not** add separator lines on regular content slides.
- No drop shadows anywhere.

### 4.3 Components

**Content card**
- Fill `FAFAFA`, border `EFEFEF` 0.75 pt, radius standard.
- Inner padding: 0.35 – 0.45 in left/right, 0.35 in top.
- Structure: optional "Content Header" (Inter Bold 10–12 pt) → 0.3 in gap → body (8 pt) or bullet list.
- Full-height cards on a title slide span y = 1.08 → 5.00 (h = 3.92).

**Accent card (callout)**
- Fill `0EB584` (or the sector color), no border, white bold 8 pt text. Use for at most one card per slide.

**Dark chart card**
- Fill `2B2B2B`, radius standard, chart title Inter Bold 10 pt white, chart inside with white category labels and white legend text.

**Label pill (title Layout #2)**
- `roundRect` fully rounded, fill accent (`0EB584` default), w = 1.20, h = 0.31, text Inter Bold 12 pt white, centered. Placed at x = 0.36, y = 0.33; title text starts at x = 1.65 (Light 16 pt).

**Sector chip (title Layouts #3/#5, sector lists)**
- Icon inside a thin circular outline (0.42 in) + fully rounded pill in sector color with sector name in white 8 pt. Overall group ≈ 1.89 × 0.42 in.
- Layout #3: chip at left, title to the right on the same baseline.
- Layout #5: chip on its own line, bold title + intro line below.

**Numbered circle**
- `ellipse`, no fill, outline `595959` 0.75 pt, 0.32 in, digit Inter Bold 10 pt centered. In colored field blocks use a white-filled 0.26 in circle with the digit in the block color.
- Layout #4: circle at x = 0.37, y = 0.37; bold title at x = 0.80; intro line beneath.

**Agenda circle**
- `ellipse` 1.07 in, outline in a rotating accent (green, coral, yellow, purple, blue), digit Inter Regular 36 pt charcoal centered. Horizontal variant: 0.62 in circles.
- Vertical agenda: circle → title (12 pt bold) → time range (8 pt, two lines) → description (7 pt), separated by a pale green fully-rounded track behind the row.

**Data entry row**
- `roundRect` h = 0.44, fill `FCFCFC`, border `D9D9D9`, text 8 pt `26323E` left-aligned with 0.28 in inset, vertically centered. Rows stacked with 0.05 in gap.
- Leading label block: `roundRect` w = 1.88, h = 0.44, solid color in the rotating six-color order (charcoal, green, coral, yellow, purple, blue), with white numbered circle + white bold 10 pt field name.

**Note box**
- `roundRect` fill `FCFCFC`, border `0EB584` (positive/informational) or `F99383` (negative), h = 0.46 – 0.63.
- Leading glyph in a 0.17 in circle outline of the same color: `!` for reminders, `✓` for positives, `✗` for negatives.
- Text: bold lead-in ("Note:") + regular sentence, 7 pt.

**Legend**
- Row of 0.16 in filled circles + 7 pt labels, "Legend" in bold at the start. Bottom-right of the content area, aligned with the note box baseline.

**Stat tile**
- `roundRect`, w = 2.22, h = 2.19, fill in a tonal sequence (L0 → L3 of one hue, e.g. `0FB684`, `3CC59C`, `68D3B3`, `95E1CB`). Number Inter Medium 32 pt at y + 0.25; caption Inter Medium 11 pt at the bottom (y + 1.47). White text on L0–L1, charcoal on L2–L3.
- Single hero tile variant: w = 4.57, number 48 pt with caption to its right.

**Process step (horizontal)**
- Fully rounded field (`FCFCFC`, `D9D9D9` border) with the step name in bold 8 pt, connected by `→` glyphs; below each step, a bold 9 pt title and a 7 pt description.

**Status matrix row**
- Left: fully rounded field with numbered circle + bold 10 pt row name (w = 1.63, h = 0.44).
- Middle: status dot 0.3 in (green / blue / yellow / coral).
- Right: wide field with two `●` bullets of 7 pt text.
- Legend at bottom right.

**Checklist card (3 columns)**
- Card fill `FAFAFA`, border `95E1CB`, w = 3.03, h = 3.91.
- Inside: `✓` in a 0.33 in green circle + title Inter Regular 16 pt `0EB584` → `→` bullet list, 9 pt.

**Yes/No review list**
- Two-column rows: statement (bold 7 pt) | `Yes/No` toggle text | `Comment…` field. Alternate row backgrounds `F7F6F6` / white.

### 4.4 Tables
- Header row fill `545454`, text Inter Bold 7 pt white, centered; row height ≈ 0.30 in.
- First column: Inter Bold 7 pt charcoal, left aligned, fill follows row banding.
- Body rows alternate `F0F0F0` (odd) and `FCFCFC` (even); text Inter Light 7 pt, centered for numeric cells, left for text.
- All internal borders: 1.5 pt white. No outer border. No vertical rules other than the white gaps.
- Cell padding: 0.03 in left/right, 0.03 in top/bottom (`marL/marR = 28575`, `marT/marB = 27425` EMU), vertical anchor centered.
- Maximum 9 rows × 6 columns per slide; split larger tables.

### 4.5 Charts
- Keep charts native (PowerPoint charts), never images.
- Palette for multi-series: Series 1 `0EB584`, Series 2 `0089C5`, Series 3 `F49D07`, then `FB563B`, `7E46B8`, `A7A7A7`.
- Single-hue charts (pie/donut, one-topic bars): use the tonal scale of the relevant sector color, L0 → L3 (`0FB684`, `3CC59C`, `68D3B3`, `95E1CB` for green; `FB563B`, `F99383`, `FDB4A9`, `FDD4CE` for coral).
- Data labels on, Inter 7–8 pt, white inside colored bars, charcoal outside.
- Gridlines: none or `D1D1D1` 0.5 pt. No 3-D, no shadows, no chart borders.
- Chart title: "Chart Title" style, Inter Bold 10 pt, placed above the chart inside its card.
- Legend at the bottom, 7 pt, only when more than one series.
- Charts live inside a card (`FAFAFA` light or `2B2B2B` dark). On dark cards, all chart text is white and stacked bars separate with thin white gaps.

### 4.6 Photographs
- Documentary, warm, people-centered images of LLF beneficiaries (farmers, health workers, children). Never stock-style corporate imagery or illustrations.
- Placements: (a) full-bleed right half on section dividers; (b) right column x = 6.25, w = 3.39, h = 4.89 with standard corner radius; (c) full-width banner y = 1.08, h = 1.36 with rounded corners; (d) square 2.99 × 3.94 left column inside the card grid.
- Photos never have borders or shadows. Corners rounded like cards when inside the content area; square when bleeding to the edge.

### 4.7 Iconography
Six custom flat icons, one per theme. Use only these; do not add generic icon libraries.

| Icon | Form | Color |
|---|---|---|
| Primary Healthcare | Shield | Coral `FB563B` |
| Agriculture | Two leaves growing upward | Green `0EB584` |
| Social Infrastructure | Layered geometric blocks (bridge) | Yellow `F49D07` |
| Gender Equality | Two symmetrical shapes facing inward | Purple `7E46B8` |
| Climate Adaptation | Four-blade pinwheel | Blue `0089C5` |
| Fund / Master identity | Two stacked curved shapes | Green `0EB584` |

Three usage modes:
1. **Labeled icon strip** — icon in a circular outline + color-coded pill label. For legends, diagrams, sector lists, slide titles (Layouts #3/#5).
2. **Standalone symbol** — icon alone, no text, no background. For compositions, over photos, decorative accents.
3. **Overlay** — icon rendered as a transparent gradient inside a solid color block (rounded square, sector color). For covers, dividers, background visuals only.

Icons are never recolored outside their sector color, never outlined, never rotated.

### 4.8 Ready-to-use glyphs
Use Unicode glyphs in Inter, not shapes or icon fonts: `→ ← ↑ ↓ ↖ ↘ ↗ ↙ ↔ ↕ ↩ ↪`, `✓ ✗ → ! ?`, and circled numerals `1–5` (digit inside a 0.26 in circle outline). Available in charcoal on light, white on green, green on dark.

---

## 5. Slide archetypes (recipes)

Each recipe lists background, footer, and the exact placement to reproduce. Vary layouts across a deck; never use the same archetype for more than two consecutive slides.

### 5.1 Cover
- Background `2B2B2B` full bleed, y = 0 → 4.59; white band y = 4.59 → 5.625 with the six partner logos (KSrelief, ADFD, Gates Foundation, ISFD, QFFD, IsDB) preceded by "A development initiative by".
- LLF logo (white) top-left, x = 0, y = 0, w = 2.63.
- Title: Inter Bold 30 pt `F49D07`, x = 1.33, y = 2.24. Subtitle: Inter Light 12 pt white, x = 1.33, y = 2.81.
- Variants: image-based (photo replaces dark block with dark overlay), icon-led (large overlay icon at right), minimal (as above).

### 5.2 Section divider
- Background `2B2B2B`, no footer.
- Variant A (simple): title Inter Bold 20 pt `F49D07` centered, description 12 pt white beneath (x = 2.31, w = 5.35, y = 2.44 / 2.88).
- Variant B (with image): photo right half (x = 5.0 → 10.0, full height); title left-aligned x = 0.55, y = 2.59, w = 3.77; optional 8 pt white description.
- Variant C (numbered): 0.64 in circle outline `F49D07` with the section number (Inter SemiBold 14 pt `F49D07`) + fully rounded outlined pill containing the section title, both centered vertically at y = 2.49.

### 5.3 Agenda / overview
- Variant A (vertical list, 3 items): 1.07 in circles at x = 1.90 stacked 1.13 in apart; each row on a pale green rounded track; columns: title (x = 3.47) → time (x = 4.70) → description (x = 5.66).
- Variant B (horizontal, 5 items): 1.07 in circles across the top (y ≈ 0.85), tall rounded tracks beneath each holding title + time.
- Variant C (horizontal, 5 items, light): 0.62 in circles + title + description columns, no tracks.
- Variant D: same as C on dark background with white text.

### 5.4 Title layouts for content slides (pick one per slide)
| # | Recipe |
|---|---|
| 1 | Light 16 pt title only, x = 0.36, y = 0.34, w = 9.31, up to 2 lines. Content starts at y = 1.08. |
| 2 | Green label pill + Light 16 pt title on one line. Content starts at y = 0.85. |
| 3 | Sector chip + Light 16 pt title on one line. |
| 4 | Numbered circle + **Bold** 16 pt title + Light 8 pt intro line. Content starts at y = 1.35. |
| 5 | Sector chip on top, then Bold 16 pt title + 8 pt intro line. Content starts at y = 2.04. |

### 5.5 Content archetypes
- **Text + photo**: photo right (x = 6.25), left side has an icon card (1.54 in square, `FAFAFA`) with a large sector icon, a text card beside it, and a wide text card below.
- **Two text cards**: 4.54 in cards side by side, y = 1.08 → 5.00, one may be an accent (green) callout card with white text.
- **Photo + text card + chart card**: three 3.00 in columns — photo | `FAFAFA` text card | dark `2B2B2B` chart card.
- **Text + chart**: text card 5.78 in wide | chart card 3.00 in wide (light or dark).
- **Four-card grid**: 2 × 2 cards, each 4.54 × 1.85, gap 0.16.
- **Stat slide**: 48 pt bold headline + 16 pt bold sub-headline top-left; row of four 2.22 in stat tiles in a tonal sequence at y = 2.86.
- **Hero stat**: headline + one photo tile + one icon tile + one wide accent tile with 48 pt number.
- **Banner photo + two text cards**: full-width rounded photo y = 1.08 h = 1.36, then two cards below.
- **Table slide**: label pill title + full-width table y = 0.85 → 4.50; note box bottom-left; legend bottom-right.
- **Quote + table**: intro card left (2.2 in) with a green opening quote mark; table right (6.69 in).
- **Process (4 steps)**: horizontal field → arrow chain at y ≈ 1.24, titles and descriptions beneath, two paragraph cards at the bottom.
- **Data entry list (6 rows)**: colored label blocks left (w = 1.88), fields right (w = 7.39), h = 0.44, gap 0.05; two note boxes at y = 4.51.
- **Sector list (5 rows)**: sector chip left, field right; positive/negative note boxes below.
- **Status matrix (6 rows)**: numbered field | status dot | bullet field; legend bottom-right.
- **Two comparison cards**: header + `●` bullet list in each 4.54 in card.
- **Three checklist cards**: `✓` + green title + `→` list in each 3.03 in card.
- **Yes/No review**: statement | Yes/No | Comment rows, alternating bands.

### 5.6 Closing slide
- Background `2B2B2B`; white partner-logo band at the bottom (y = 4.59 → 5.625).
- LLF logo (white) centered-left (x = 2.16, y = 1.39, w = 2.63); statement "Partnership in action. Impact at scale." Inter Bold 18 pt white to its right (x = 4.75, y = 1.92); website `www.livesandlivelihoodsfund.org` in a small outlined pill (`F49D07`) beneath.

---

## 6. Do / Don't checklist

**Do**
- Keep one accent per slide unless colors encode categories.
- Put all content inside cards or clearly aligned columns; align card edges across the slide.
- Use tonal scales (L0–L5) for multi-value data.
- Use Inter Light for titles; bold only for emphasis, headers and numbers.
- Keep body text at 7–8 pt and let whitespace do the work.
- Use `●` / `→` bullets, `✓ ✗ ! ?` glyphs and numbered circles as the only decorative devices.
- End every content slide with the footer text + slide number.

**Don't**
- No gradients, shadows, 3-D, bevels, reflections.
- No accent lines under titles, no header/footer bars, no vertical color stripes, no single-edge borders on cards.
- No colors outside the palette (including pure black or off-palette grays).
- No fonts other than Inter; no italic titles; no ALL CAPS.
- No clip art, stock icons, emoji, or illustrations; only the six LLF icons and Unicode glyphs.
- No content in the 0.36 in margins (except full-bleed photos and dark backgrounds).
- No more than ~9 table rows, 6 columns, 4 stat tiles, or 3 charts per slide.
- Never mix a dark card and an accent card on the same slide.

---

## 7. Implementation quick reference (pptxgenjs)

```javascript
const pres = new pptxgen();
pres.layout = "LAYOUT_16x9"; // 10 x 5.625 in

const C = {
  charcoal: "2B2B2B", green: "0EB584", coral: "FB563B", yellow: "F49D07",
  purple: "7E46B8", blue: "0089C5", white: "FFFFFF",
  cardFill: "FAFAFA", cardLine: "EFEFEF", fieldFill: "FCFCFC", fieldLine: "D9D9D9",
  tableHeader: "545454", bandA: "F0F0F0", bandB: "FCFCFC", muted: "A7A7A7",
  circleLine: "595959", fieldText: "26323E", panel: "F7F6F6",
};

const F = "Inter";
const M = { l: 0.36, t: 0.34, w: 9.28, contentBottom: 5.05, footerY: 5.25 };

// Slide title (Layout #1)
slide.addText(title, { x: 0.36, y: 0.34, w: 9.31, h: 0.54, fontFace: F, fontSize: 16,
  color: C.charcoal, isTextBox: true, margin: 0, valign: "top" });

// Standard card
slide.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, fill: { color: C.cardFill },
  line: { color: C.cardLine, width: 0.75 }, rectRadius: 0.08 });

// Label pill (Layout #2)
slide.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.36, y: 0.33, w: 1.2, h: 0.31,
  fill: { color: C.green }, line: { color: C.green, width: 0 }, rectRadius: 0.155 });
slide.addText("Label", { x: 0.36, y: 0.33, w: 1.2, h: 0.31, fontFace: F, fontSize: 12, bold: true,
  color: C.white, align: "center", valign: "middle", isTextBox: true, margin: 0 });

// Footer
slide.addText([{ text: "Lives and Livelihoods Fund | ", options: { bold: false } },
               { text: deckName, options: { bold: true } }],
  { x: 0.26, y: 5.25, w: 3.38, h: 0.3, fontFace: F, fontSize: 7, color: C.charcoal, isTextBox: true });
slide.addText(String(n), { x: 7.51, y: 5.25, w: 2.25, h: 0.3, fontFace: F, fontSize: 7,
  color: C.muted, align: "right", isTextBox: true });

// Chart palette
const chartColors = [C.green, C.blue, C.yellow, C.coral, C.purple, C.muted];
const greenScale = ["0EB584", "3BC49C", "68D3B3", "95E1CB", "C2F0E2"];
```
