# Code workflow

How code is managed in this repository: branches, commits, pull requests,
review, merging into `main`, deploying, CI. The machine-level detail —
worktrees, the deploy checkout, the Docker stack — is in
[development-environment.md](development-environment.md).

## Principles

1. **One repository.** Source, documentation and history live in this
   repository, `Millennium-Promise-Alliance/ARBM-MIS` on GitHub.
2. **Every change goes through a reviewed pull request.** Nobody pushes to
   `main`. A change reaches `main` only by merging a pull request that another
   developer has approved and whose CI has run
   ([decisions/0015](decisions/0015-reviewed-pull-requests.md)).
3. **`main` is deployed.** What is in `main` is what the development environment
   serves. The deploy checkout follows `origin/main` with fast-forward pulls
   and never commits anything of its own.
4. **One branch per change.** Every change, however small, is made on its own
   branch and merged with a merge commit, so `git log --first-parent main` reads
   as a changelog.
5. **English** across source code, comments, commit messages, pull requests and
   documentation. Existing French files are edited in French for consistency
   within the file until the migration is decided
   ([decisions/0004](decisions/0004-language-new-code-english.md)); new code is
   English.
6. **Verification is stated, not assumed.** CI runs on every pull request and
   on every push to `main`; what it does and does not check is in
   [testing-and-ci.md](testing-and-ci.md). Anything CI cannot see — data,
   fixtures, seeds — is verified in the environment and the verification is
   written in the pull request.

## Lifecycle

### 1. Branch

Always from an up-to-date `origin/main`:

```bash
git fetch origin
git worktree add .claude/worktrees/<name> -b <prefix>/<name> origin/main
```

A worktree is the convention on the development server, where the deploy
checkout must stay on `main`. On any other machine a plain
`git switch -c <prefix>/<name> origin/main` in a clone is equally valid.

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
`!` for breaking changes. Pull requests are merged with a merge commit, not
squashed, so the commit messages **are** the history — write them for a reader
a year from now.

To split one file's edits into two commits without interactive git: back the
file up outside the repository, `git checkout -- <file>`, reapply only the
first commit's changes, commit, restore the backup, commit the rest. Then prove
the split was faithful: `git diff HEAD~2 HEAD` must equal the pre-split diff.

### 3. Keep the branch current

```bash
git fetch origin
git rebase origin/main
git push --force-with-lease     # only if the branch was already pushed
```

`--force-with-lease`, never `--force`, and only on your own branch. Once a
review has started, prefer adding commits to rewriting them, so the reviewer
can see what changed since their last pass; rebase then only to resolve a
conflict with `main`. A branch that depends on another unfinished branch is
created from it and its pull request targets that branch; when the parent
merges, retarget the pull request to `main` and `git rebase origin/main`.

### 4. Verify

- Run what can be run: `pytest` in the backend container, the frontend build,
  the management command with `--dry-run` where it exists.
- For anything that touches data, run it against the environment through an
  ephemeral container ([development-environment.md](development-environment.md#running-branch-code))
  and record what happened.

### 5. Open a pull request

```bash
git push -u origin <prefix>/<name>
gh pr create --base main --fill      # or from the GitHub web interface
```

The title follows Conventional Commits, like a commit subject. The description
says:

- **what** changes and **why**, with a link to the issue if there is one;
- **how it was verified** — commands run, what was checked in the environment;
- **effects on data** — migrations, seeds, imports, anything written to the
  shared database, and whether it has already been run;
- anything the reviewer should look at first.

A pull request that is not ready for review is opened as a draft.

### 6. Review

At least **one approval from a developer other than the author**. The reviewer
reads the diff, the description and the CI result — the `migrations` job, not
just the checkmark ([testing-and-ci.md](testing-and-ci.md#ci)) — and either
approves or requests changes. The author answers every comment, with a change
or with a reason, and the reviewer resolves the conversation.

A new push after an approval means the change is reviewed again: the approval
covers the diff it was given for.

### 7. Merge

The **author** merges, on GitHub, once the pull request is approved, CI has run
and every conversation is resolved. Always with **Create a merge commit** — never
squash or rebase — so `git log --first-parent main` lists one merge per change
and each change's own commits stay intact.

### 8. Deploy

Merging does not deploy by itself. From the deploy checkout, on `main`, with a
clean working tree:

```bash
git pull --ff-only origin main
docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml up -d --build
```

`--ff-only` fails if the deploy checkout has a commit of its own, which it must
never have. Deploy right after merging, so that what is in `main` and what is
served stay the same.

### 9. Clean up

```bash
git worktree remove .claude/worktrees/<name>
git branch -d <prefix>/<name>
git push origin --delete <prefix>/<name>     # unless GitHub already deleted it
```

`-d` verifies the branch is in `main`; if it refuses, pull `main` first, and if
it still refuses, something was not merged.

## Reverting

A change that must come back out goes through the same path: a branch with
`git revert -m 1 <merge-sha>`, a pull request, a review, a merge, a deploy.

## Pushing

Work branches are pushed to open and update their pull request; pushing is also
the only copy off the developer's machine, so push unfinished work too, as a
draft if needed. `main` is never pushed directly. What warrants a pause:
anything with `--force` or `--force-with-lease` on a branch someone else is
working on, and deleting a remote branch that is not yours.

## Repository settings

These GitHub settings support the rules above; changing them is the
repository administrators' business.

- **Pull requests:** allow merge commits only (squash and rebase merging
  disabled); automatically delete head branches after merge.
- **Branch protection on `main`:** require a pull request with one approval,
  dismiss stale approvals on new commits, require the `backend`, `frontend` and
  `migrations` checks, require conversations resolved, block force pushes and
  deletion, and apply the rules to administrators too.

Branch protection is **not available** for this private repository on the
organisation's current GitHub plan, so today the review rule is kept by
convention, not enforced by GitHub. Enabling it requires a plan that offers
protected branches for private repositories, or a public repository
([decisions/0015](decisions/0015-reviewed-pull-requests.md)).
