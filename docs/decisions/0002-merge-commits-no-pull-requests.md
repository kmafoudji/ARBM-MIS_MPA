# 0002 — Merge commits, no required pull requests, no branch protection

## Context

With one maintainer there is no reviewer. A required pull request, a squash
merge and branch protection would have the maintainer approving themself and
would move the merge commit off the machine that serves the code.

## Decision

- Every change is merged into `main` with `git merge --no-ff`, from the deploy
  checkout, so `git log --first-parent main` lists one merge per change and
  each change's own commits stay intact.
- Pull requests are optional, used when a diff and a CI run are wanted before
  merging; the merge itself is still done locally.
- `main` has no branch protection on the remote.
- Individual commit messages follow Conventional Commits, since there is no
  squash to rewrite them.

## Consequences

- `git branch -d` verifies that a branch is in `main`; `-D` is not needed.
- A dependent branch rebases with a plain `git rebase main`; no `--onto`.
- Linear history is not a goal.
- If a second contributor appears, protection and required checks are
  reconsidered.
