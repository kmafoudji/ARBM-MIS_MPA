# 0008 — Typographic hierarchy follows the POC mockups, not the LLF template's Light titles

## Context

The LLF visual identity spec ([style/design.md](../style/design.md), §3.3) sets page
titles in Inter Light (300). The stylesheet followed it until 6 September
2026: a 30px Light title, card titles at 600, labels at 600, most secondary
text in grey. The POC mockups use the
same typeface and the same 14px base but put every element that carries
hierarchy in weight 700–800 and in a semantic colour (green codes, yellow and
coral figures), on a warm grey ground with white 12px-radius cards. Side by
side, the app read as smaller and flatter although its sizes were equal or
larger; the difference was weight and contrast, not size.

## Decision

- The application's type scale, weights and surfaces follow the mockups:
  page titles 26px/800, card and section titles 800, eyebrows and field
  labels 800, project codes in bold green monospace, active navigation white
  on green, page ground `#F7F6F6` with white cards and 12px radius.
- Base size stays 14px; density comes from `line-height 1.35` and compact
  card padding, not from smaller text.
- The LLF template spec remains the source for colours, sectors and status
  mappings, and for the no-shadow rule. Where it prescribes Light titles it
  is overridden by this decision.

## Consequences

- Inter is loaded at 400–800; weight 300 is no longer loaded and must not be
  used.
- Any future re-alignment with the LLF template on typography is a new
  decision, not a silent revert in `styles.css`.
- Component-level work that follows (dark project hero, segmented stage bar,
  list rows, removal of the legacy `#A4C53F` olive) applies the same rule:
  hierarchy by weight and colour.
