"""
Import en masse d'un classeur AS-IS (13 feuilles) — voir
docs/superpowers/specs/2026-08-21-asis-bulk-import-design.md.

La frontiere qui compte : `parser` decide tout, `applier` ne fait qu'ecrire.
Les deux modes de l'endpoint executent la meme analyse ; seul l'appel a
`apply()` les distingue. Un rapport de validation ne peut donc jamais
diverger de ce qu'un commit ferait reellement.
"""
