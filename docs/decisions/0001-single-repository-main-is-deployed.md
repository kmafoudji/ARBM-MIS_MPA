# 0001 — A single repository; `main` is the deployed branch

## Context

The project is developed by one maintainer, with one development environment
that serves the code directly from a git checkout. There is no separate
integration branch.

## Decision

- The repository at `origin`, `Millennium-Promise-Alliance/ARBM-MIS`, is the
  single source of truth. `main` and every work branch are pushed there.
- `main` is the branch checked out in the deploy checkout and therefore what
  the environment serves. It moves only by merging a finished branch.
- There is no `develop` or staging branch. A change is either on a work branch
  (visible to nobody) or in `main` (deployed).

## Consequences

- Merging is deploying; a merge is followed by a redeploy and a push.
- Something that must be shown before it is accepted is merged and, if
  rejected, reverted (`git revert -m 1`).
- A second machine or person pushing to `main` would reintroduce the need to
  `pull --ff-only` before branching; the workflow notes where.
