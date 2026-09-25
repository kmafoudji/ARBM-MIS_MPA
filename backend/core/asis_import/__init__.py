"""
Bulk import of an AS-IS workbook (13 sheets) — see
docs/specs/2026-08-21-asis-bulk-import-design.md.

The boundary that matters: `parser` decides everything, `applier` only
writes. Both endpoint modes run the same parse; the only difference is
whether `apply()` is called afterwards. A validation report can therefore
never disagree with what a confirm would do.

Written in English, unlike the rest of the backend. The report this package
produces is user-facing content on an English screen, not an incidental
error string — see docs/decisions/0004-language-new-code-english.md.
"""
