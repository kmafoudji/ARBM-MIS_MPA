# Code workflow

How code is managed in this repository: branches, commits, merging into `main`,
CI. The machine-level detail — worktrees, the deploy checkout, the Docker stack
— is in [development-environment.md](development-environment.md).

## Principles

1. **One repository.** Source, documentation and history live in this
   repository, `Millennium-Promise-Alliance/ARBM-MIS` on GitHub.
2. **`main` is deployed.** What is in `main` is what the development environment
   serves. `main` moves only by merging a finished branch.
3. **One branch per change.** Every change, however small, is made on its own
   branch and merged with a merge commit, so `git log --first-parent main` reads
   as a changelog.
4. **English** across source code, comments, commit messages and
   documentation. Existing French files are edited in French for consistency
   within the file until the migration is decided
   ([decisions/0004](decisions/0004-language-new-code-english.md)); new code is
   English.
5. **Verification is stated, not assumed.** CI runs on every push to `main`;
   what it does and does not check is in
   [testing-and-ci.md](testing-and-ci.md). Anything CI cannot see — data,
   fixtures, seeds — is verified in the environment and the verification is
   written down with the change.

## Lifecycle

### 1. Branch

```bash
git worktree add .claude/worktrees/<name> -b <prefix>/<name> main
```

Prefixes:

| Prefix | Use |
|---|---|
| `feature/` | new capability |
| `fix/` | bug fix |
| `docs/` | documentation |
| `refactor/` | no behaviour change |
| `chore/` | maintenance, configuration |
| `test/` | tests |
| `ci/` | CI workflow |

Descriptive, lower-case, hyphenated. Auto-generated names are not accepted.

### 2. Commit

Stage explicitly (`git add <file>`), never `git add .`. Conventional Commits:

```
feat(results): add chain_level field to Indicator
fix(reference): keep import_gadm running after per-country download failures
chore(ui)!: remove the legacy sidebar
```

Prefixes `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `chore`, `ci`;
`!` for breaking changes. Without squash merges the commit messages **are** the
history — write them for a reader a year from now.

To split one file's edits into two commits without interactive git: back the
file up outside the repository, `git checkout -- <file>`, reapply only the
first commit's changes, commit, restore the backup, commit the rest. Then prove
the split was faithful: `git diff HEAD~2 HEAD` must equal the pre-split diff.

### 3. Keep the branch current

```bash
git rebase main
git push --force-with-lease     # only if the branch was already pushed
```

`--force-with-lease`, never `--force`. A branch that depends on another
unfinished branch is created from it; when the parent merges, a plain
`git rebase main` on the child is enough, since the parent's commits are in
`main` under the same hashes.

### 4. Verify

- Run what can be run: `pytest` in the backend container, the frontend build,
  the management command with `--dry-run` where it exists.
- For anything that touches data, run it against the environment through an
  ephemeral container ([development-environment.md](development-environment.md#running-branch-code))
  and record what happened.

### 5. Merge

From the deploy checkout, on `main`, with a clean working tree:

```bash
git merge --no-ff <prefix>/<name>
docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml up -d --build
git push origin main
```

- `--no-ff` always, even for a single commit: one merge commit per change.
- Merging is deploying. Push right after; it is a backup and it triggers CI.
- If it must come back out: `git revert -m 1 <merge-sha>`, redeploy.

### 6. Clean up

```bash
git worktree remove .claude/worktrees/<name>
git branch -d <prefix>/<name>
git push origin --delete <prefix>/<name>
```

`-d` verifies the branch is in `main`; if it refuses, something was not merged.

## Pull requests

Optional. There is no reviewer, so nothing requires one. A PR is useful when a
readable diff and a CI run are wanted **before** the change reaches the
environment: push the branch, open the PR, read CI, then merge **locally** with
step 5 — not with the GitHub button, so the deploy checkout is the one that
creates the merge commit and `main` never diverges from what is served.

## Pushing

Pushing `main` after a merge and work branches whenever they have new commits is
routine: the remote is the organisation's repository and the only copy off the
development machine. What warrants a pause: anything with `--force`, and
deleting a remote branch.

## Branch protection

None ([decisions/0002](decisions/0002-merge-commits-no-pull-requests.md)). A
single developer merging locally would only be blocking themself. Revisit if a
second person or machine starts pushing.
