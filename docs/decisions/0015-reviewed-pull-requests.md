# 0015 — Every change reaches `main` through a reviewed pull request, merged with a merge commit

## Context

Development is shared: more than one developer works on the repository, and
each change should be read by someone other than its author before it reaches
the branch the development environment serves.

## Decision

- Nobody pushes to `main`. A change reaches it only by merging a pull request.
- A pull request is merged only after **at least one approval from a developer
  other than its author**, with CI run and every review conversation resolved.
  A push after an approval requires a new one.
- The author merges, on GitHub, with **Create a merge commit**. Squash and rebase
  merges are not used, so `git log --first-parent main` lists one merge per
  change and each change's own commits stay intact.
- Individual commit messages follow Conventional Commits, since there is no
  squash to rewrite them; pull request titles follow them too.
- The rule is meant to be enforced by branch protection on `main` (required
  pull request and approval, stale approvals dismissed, required CI checks, no
  force pushes, administrators included). On the organisation's current GitHub
  plan branch protection is not available for this private repository, so
  until the plan changes or the repository becomes public the rule is kept by
  convention.

## Consequences

- Merging no longer deploys by itself: the deploy checkout pulls `main` with
  `--ff-only` and the stack is redeployed after each merge.
- Reverts are pull requests too (`git revert -m 1` on a branch).
- `git branch -d` verifies that a branch is in `main` once `main` has been
  pulled; `-D` is not needed.
- Linear history is not a goal.
- While protection is unavailable, nothing technical stops a direct push to
  `main`; a push that bypasses review is reverted through a pull request.
