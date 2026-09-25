# Documentation

How aRBM-MIS is developed and operated, as it is now. Each page states rules
and procedures in the present tense; the history of how they came about is the
maintainer's business and is kept in their untracked notes, not here.

| Page | What it answers |
|---|---|
| [workflow.md](workflow.md) | How a change goes from a branch to the deployed `main`: naming, commits, rebase, pull requests, review and approval, merge commits, deploying, repository settings. |
| [development-environment.md](development-environment.md) | The deploy-checkout-plus-worktrees layout, the two `docker compose` rules that fail silently, the three untracked per-machine files, start-up pitfalls, how to run branch code, why there is one stack. |
| [testing-and-ci.md](testing-and-ci.md) | What the three CI jobs prove, why the test step does not block yet, how to run `pytest` and which management commands have a dry run. |
| [fresh-environment.md](fresh-environment.md) | Building an environment from an empty database or from a dump, in order, and the state that exists only in the maintained database. |
| [demo-offline.md](demo-offline.md) | Preparing a machine that will run the application with no internet: what to pull while it still has a connection, what to restore instead of seeding, what falls back to what, and the rehearsal that proves it. |
| [design.md](design.md) | The LLF-derived design tokens and rules the frontend follows. |
| [style/](style/design.md) | The LLF visual identity as extracted from the official presentation template: the specification, the brand assets (logos, sector icons, photos), the Inter font files and the template itself. The source `design.md` is derived from. |
| [decisions/](decisions/README.md) | Process and architecture decisions in force, one file each, and the questions still open. |
| [specs/](specs/) | Feature specifications and their implementation plans, dated. |

Entra ID configuration and the first-run steps are in the repository
[README](../README.md).
