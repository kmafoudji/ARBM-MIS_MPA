# 0007 — The sector taxonomy has two levels: a project sits in a sector, under a pillar

## Context

The LLF2 results framework classifies interventions in three **pillars**
(Productivity Enabling Infrastructure, Human Capital Development, Resilience)
and eight **sectors** under them (Transport, Energy, Digital Infrastructure,
Rural Development; Education, Health; Agriculture & Food Security, Water &
Sanitation). The `Sector` table has carried this tree through `parent` since
5 September 2026, but nothing told the two levels apart: a project could name
a pillar as its primary sector, forms listed the eleven rows flat, and every
filter matched a sector id exactly, so filtering on a pillar found nothing.

## Decision

- `Sector.parent` is the only structure: null means pillar, otherwise sector.
  There is no `pillar` column on `Project`; the pillar of a project is the
  parent of its primary sector, exposed by the API as `pillar_id` and
  `pillar_name`.
- A project is classified in a **sector**, never in a pillar: the create and
  classification endpoints reject a first-level entry that has children as
  primary or contributing sector. A first-level entry without children stays
  acceptable, so the rule is about grouping, not depth.
- Every filter that takes a sector id (portfolio aggregation, indicator
  catalogue) accepts a pillar id and includes its sectors.
- Forms offer sectors only, grouped under their pillar; filters offer the
  pillar as "All <pillar>" above its sectors; the overview rolls up by pillar.
- `Sector.parent` is `PROTECT`: a pillar with sectors cannot be deleted.
  Retirement is the soft delete of POL-1.07, as for every reference entry.

## Consequences

- Rows already pointing at a pillar are not rewritten by a migration: which
  sector they belong to is a classification decision, taken by hand and
  recorded in the maintainer's notes. Until then they show under the pillar
  with no sector.
- ADR 0006 stands: sectors keep a primary and contributing set, and the
  primary does not repeat as contributing.
- `Indicator.sector` is not validated against the rule yet; the eleven
  indicators of the project still classified at pillar level follow it when
  the project is reclassified.
