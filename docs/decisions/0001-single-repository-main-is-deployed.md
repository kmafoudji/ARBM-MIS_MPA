# 0001 — A single repository; `main` is the deployed branch

## Context

The project is developed by several developers and has one development
environment, which serves the code directly from a git checkout. There is no
separate integration branch.

## Decision

- The repository at `origin`, `Millennium-Promise-Alliance/ARBM-MIS`, is the
  single source of truth. `main` and every work branch are pushed there.
- `main` is the branch checked out in the deploy checkout and therefore what
  the environment serves. It moves only by merging a reviewed pull request
  ([0015](0015-reviewed-pull-requests.md)); the deploy checkout follows it with
  `git pull --ff-only`.
- There is no `develop` or staging branch. A change is either on a work branch
  (under review) or in `main` (deployed).

## Consequences

- A merge is followed by a pull in the deploy checkout and a redeploy.
- Something that must be shown before it is accepted is merged through a
  reviewed pull request and, if rejected, reverted through another
  (`git revert -m 1`).
- Branches start from a freshly fetched `origin/main`, since others merge into
  it.
