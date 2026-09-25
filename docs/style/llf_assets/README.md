# LLF brand assets

Companion package to `design.md`. Every file was extracted verbatim from `LLF_TEMPLATE_STYLE.pptx`
(except one derived file, marked below). All PNGs keep their alpha channel.

## logos/
| File | Size | Use |
|---|---|---|
| `llf-logo-white.png` | 2048 × 1448 | Master logo, white. Cover (top-left, w = 2.63 in) and closing slide. Use on `2B2B2B` or photo backgrounds. |
| `llf-logo-charcoal-derived.png` | 2048 × 1448 | **Derived**: alpha of the white logo recolored to `2B2B2B` for light backgrounds. Not an original template file. |
| `partner-logos-band-transparent.png` | 8000 × 910 | "A development initiative by" + six partner logos (KSrelief, ADFD, Gates Foundation, ISFD, QFFD, IsDB). Transparent background. Cover bottom band, full width, y = 4.49, h = 1.14 in. |
| `partner-logos-band-white.png` | 2048 × 231 | Same band on white. Closing slide, y = 4.59, h = 1.03 in. |
| `partner-logos-band-white-wide.jpg` | 4000 × 455 | Same band, JPEG variant used in the cover style previews. |

## icons/
Sector colors are fixed (see design.md §4.7). Files are square with transparent background.

### icons/standalone-5000/ and icons/standalone-2048/
Standalone symbol mode — full-color icon, no background, no text. Two resolutions of the same artwork.
`agriculture` `0EB584` · `primary-healthcare` `FB563B` · `social-infrastructure` `F49D07` ·
`gender-equality` `7E46B8` · `climate-adaptation` `0089C5` · `fund-master` `F49D07` (two stacked curved shapes; the identity symbol is drawn in yellow in the template art).

### icons/overlay/
Overlay mode — white-to-transparent gradient version of each icon. Place it on a solid sector-color rounded block (covers, section dividers, hero stat tiles). `social-infrastructure-5000.png` is the higher-resolution version used on the "Building the basics" stat slide.

### icons/labeled-chips/
Labeled-icon-strip mode — icon in a white circle + fully rounded pill with the sector name (ready to place at ≈ 1.89 × 0.42 in). Five chips exist in the template; there is no chip for Fund/Master — build it from the standalone icon + a `0EB584` pill if needed.

## glyphs/
| File | Use |
|---|---|
| `quote-mark-green.svg` | Large opening quotation mark (`0EB584`) placed before testimonial quotes. |

## photos/
Documentary photography used in the template (JPEG, RGB). Names describe subject and orientation.
- Portrait (1440 × 2160): `woman-yellow-headscarf-portrait`, `woman-carrying-basket-portrait`, `health-worker-microscope-portrait` — right column, x = 6.25 in, w = 3.39 in.
- Landscape (3240 × 2160): `farmer-portrait-hat` (section dividers, right half), `electricity-community-landscape`, `health-workers-ambulance-landscape`.
- Landscape (2048 × 1365): `women-group-landscape`, `children-crowd-landscape` — full-width banners, h = 1.36 in.

## misc/
| File | Use |
|---|---|
| `margin-overlay-guide.png` | Yellow hatched overlay showing the 0.36 in safe-area margins. Reference only. |

## Not included (not present in the PPTX)
- Clean renders of the four cover style variants: the template only contains flattened screenshots of them (with spell-check artifacts), so they were left out. Rebuild covers from `logos/`, `icons/overlay/` and `photos/` following design.md §5.1.
- Vector (SVG/AI) versions of the icons and logo — only raster PNG exists in the file.
- The Inter font files.
- Individual partner logos as separate files — they only exist composited in the bands above.
