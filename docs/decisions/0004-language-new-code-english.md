# 0004 — New code is English; existing French files stay French per file

## Context

The backend was written in French: comments, docstrings, `help_text`,
management-command output. The interface, the newer backend packages
(`core/asis_import/`), the tests written since and all documentation are in
English. A file half in each language is worse than either.

## Decision

- **New files are written in English**: code, comments, docstrings, commit
  messages, documentation.
- **An existing French file is edited in French.** Consistency within the file
  wins over the direction of travel; a file is not translated because someone
  happens to be passing through it.
- Translating the existing backend is a separate, pending decision: `help_text`
  values are user-facing and changing them generates migrations across every
  app, so it is split by risk (comments and docstrings; command output and
  messages; `help_text`) and each tier is decided on its own.

## Consequences

- Reviewers of a diff to a French file expect French in that diff.
- The English package `core/asis_import/` is not "fixed back" to French.
- The CI workflow's French step names are covered by the same rule: change
  them when the workflow is next edited for another reason, or as part of the
  pending decision, not on their own.
