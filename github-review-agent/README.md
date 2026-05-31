# GitHub Review Agent

An autonomous agent that **reviews pull requests and triages issues across all
your GitHub repositories**, posting its feedback as comments.

> **It is review + comment only.** The agent never merges, approves, closes, or
> changes labels/state — a human always decides. This is enforced structurally:
> the agent has no tool that can mutate GitHub, and the only write the harness
> performs is *posting a comment*.

## How it works

```
review-all-repos.sh   (the harness — enumerates your repos via the GitHub API)
        │  for each open PR / issue, builds context (diff or issue body)
        ▼
   claude -p --agent github-pr-reviewer   (the brain — produces review Markdown)
        │
        ▼
   lib/github.sh  →  POST a comment back to the PR / issue
```

- **`.claude/agents/github-pr-reviewer.md`** — the reviewer persona (read-only
  tools). Also usable interactively in any repo: `@agent-github-pr-reviewer`.
- **`review-all-repos.sh`** — the headless driver for the cross-repo sweep.
- **`lib/github.sh`** — thin GitHub REST helpers (reads + post-comment only).
- **`.github/workflows/review.yml`** — optional scheduled GitHub Actions runner.

### Why a harness *and* a subagent?

A Claude Code subagent runs inside a single session/repo — it can't sweep *all*
your repos on its own. The **harness** provides the autonomy (enumerate → invoke
per item → post); the **subagent** provides the judgement. You get both: run the
sweep unattended, or `@`-mention the agent for a one-off review in any repo.

## Setup

Requires `bash`, `curl`, `jq`, and the [`claude` CLI](https://code.claude.com/docs)
(`npm install -g @anthropic-ai/claude-code`).

```bash
cp .env.example .env      # fill in GITHUB_TOKEN and ANTHROPIC_API_KEY
set -a; source .env; set +a

# Safe first run — prints reviews instead of posting:
DRY_RUN=1 ./review-all-repos.sh

# Real run:
./review-all-repos.sh
```

**Token scope.** Posting a PR review comment uses the issue-comments endpoint, so
the token needs `issues:write` plus read on contents/PRs:
- Classic PAT → `repo` scope covers it.
- Fine-grained PAT → Contents=Read, Pull requests=Read, Issues=Read & write,
  across the repos/org you want covered.

## Running it autonomously

**Cron** (every 30 minutes):

```cron
*/30 * * * * cd /opt/github-review-agent && set -a && . ./.env && set +a && ./review-all-repos.sh >> /var/log/gh-review.log 2>&1
```

**GitHub Actions** — see [`.github/workflows/review.yml`](.github/workflows/review.yml).
Store `ANTHROPIC_API_KEY` and `REVIEW_GITHUB_TOKEN` (a PAT that can see all the
repos you want covered — the built-in `GITHUB_TOKEN` only sees its own repo) as
secrets.

## Idempotency

Re-running is safe and cheap:

- A **PR** is fingerprinted by its head commit SHA — only re-reviewed after new
  commits are pushed.
- An **issue** is fingerprinted by its `updated_at` — re-triaged only when it changes.

Fingerprints are stored as hidden HTML-comment markers inside the posted
comments, so no local state/database is needed.

## Configuration

All via environment variables — see [`.env.example`](.env.example). Notably:
`INCLUDE_ISSUES`, `REPOS` (allowlist), `AFFILIATION`, `MAX_DIFF_BYTES`,
`DRY_RUN`, `CLAUDE_MODEL`.

## Safety notes

- **No mutation by design.** There is deliberately no merge/approve/close helper.
  The agent literally cannot do those things.
- **Untrusted input.** PR/issue text is treated as untrusted; the agent is told
  not to follow embedded instructions ("approve this", "ignore your rules").
- **Least privilege.** Prefer a fine-grained PAT scoped to just the org/repos you
  want covered, and start with `DRY_RUN=1`.

## Extending toward auto-merge (deliberately not included)

This build stops at review + comment by design — matching your "review + comment
only" choice. If you ever want bounded merge autonomy, the safe place to add it
is the **harness** (not the agent): e.g. "merge only when checks are green **and**
a human approval already exists, behind a `MERGE=1` flag, with an explicit repo
allowlist." That changes the risk profile, so it should be a separate, explicit
decision.
