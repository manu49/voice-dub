#!/usr/bin/env bash
# Autonomous GitHub review sweep.
#
# For every repository you can access, this finds open pull requests (and,
# optionally, open issues) and asks Claude to review/triage each one, then posts
# the result back as a comment. It is REVIEW + COMMENT ONLY: nothing is ever
# merged, approved, or closed.
#
# Designed to run unattended (cron / CI / GitHub Actions). Safe to re-run: each
# item is fingerprinted (PR by head SHA, issue by last-updated time) so it isn't
# re-reviewed until it changes.
#
# Requirements: bash, curl, jq, and the `claude` CLI on PATH.
#
# Required env:
#   GITHUB_TOKEN      Token with repo read + issues:write (to post comments).
#   ANTHROPIC_API_KEY API key for the claude CLI.
# Optional env:
#   GITHUB_API        Default https://api.github.com (set for GH Enterprise).
#   INCLUDE_ISSUES    1 (default) to also triage issues, 0 to skip.
#   REPOS             Space-separated allowlist of owner/repo (default: all you can see).
#   AFFILIATION       Default "owner,collaborator,organization_member".
#   MAX_DIFF_BYTES    Truncate diffs passed to the model (default 60000).
#   DRY_RUN           1 to print reviews instead of posting them.
#   CLAUDE_MODEL      Override model (default: claude CLI default).

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/github.sh
source "${HERE}/lib/github.sh"

: "${GITHUB_TOKEN:?set GITHUB_TOKEN}"
: "${ANTHROPIC_API_KEY:?set ANTHROPIC_API_KEY (used by the claude CLI)}"

INCLUDE_ISSUES="${INCLUDE_ISSUES:-1}"
AFFILIATION="${AFFILIATION:-owner,collaborator,organization_member}"
MAX_DIFF_BYTES="${MAX_DIFF_BYTES:-60000}"
DRY_RUN="${DRY_RUN:-0}"
MARKER="<!-- claude-review -->"

command -v claude >/dev/null || { echo "error: 'claude' CLI not found on PATH" >&2; exit 1; }
command -v jq >/dev/null     || { echo "error: 'jq' not found on PATH" >&2; exit 1; }

log() { printf '%s %s\n' "$(date -u +%H:%M:%S)" "$*"; }

# Run the reviewer agent on a prompt, return its Markdown on stdout.
run_review() {
  local prompt="$1"
  local args=(-p --agent github-pr-reviewer
              --allowedTools "Read,Grep,Glob"
              --permission-mode acceptEdits
              --max-turns 6)
  [[ -n "${CLAUDE_MODEL:-}" ]] && args+=(--model "$CLAUDE_MODEL")
  # Run from HERE so .claude/agents/ is discoverable.
  ( cd "$HERE" && claude "${args[@]}" "$prompt" )
}

review_pr() {
  local owner="$1" repo="$2" num="$3" title="$4" sha="$5"
  local marker="${MARKER} sha:${sha}"
  if has_marker "$owner" "$repo" "$num" "$marker"; then
    log "    · PR #${num} already reviewed @ ${sha:0:8} — skip"; return
  fi

  local diff
  diff="$(gh_get_diff "/repos/${owner}/${repo}/pulls/${num}" | head -c "$MAX_DIFF_BYTES")"
  if [[ -z "$diff" ]]; then
    log "    · PR #${num} has no diff — skip"; return
  fi

  local prompt review
  prompt="Review this GitHub pull request. ${owner}/${repo} PR #${num}: ${title}

Unified diff:
${diff}"
  review="$(run_review "$prompt")"

  local body="${review}

---
*🤖 Automated review (advisory — a human decides whether to merge).*
${marker}"

  if [[ "$DRY_RUN" == "1" ]]; then
    printf '\n----- %s/%s PR #%s (%s) -----\n%s\n' "$owner" "$repo" "$num" "$title" "$review"
  else
    post_comment "$owner" "$repo" "$num" "$body"
    log "    ✓ Reviewed PR #${num}"
  fi
}

triage_issue() {
  local owner="$1" repo="$2" num="$3" title="$4" updated="$5" desc="$6"
  local marker="${MARKER} issue-updated:${updated}"
  if has_marker "$owner" "$repo" "$num" "$marker"; then
    log "    · Issue #${num} already triaged — skip"; return
  fi

  local prompt triage
  prompt="Triage this GitHub issue. ${owner}/${repo} issue #${num}: ${title}

Description:
${desc}"
  triage="$(run_review "$prompt")"

  local body="${triage}

---
*🤖 Automated triage (advisory). No labels or state were changed.*
${marker}"

  if [[ "$DRY_RUN" == "1" ]]; then
    printf '\n----- %s/%s issue #%s (%s) -----\n%s\n' "$owner" "$repo" "$num" "$title" "$triage"
  else
    post_comment "$owner" "$repo" "$num" "$body"
    log "    ✓ Triaged issue #${num}"
  fi
}

# --- enumerate repositories ---------------------------------------------------
if [[ -n "${REPOS:-}" ]]; then
  repos="$REPOS"
else
  repos="$(gh_get_all "/user/repos?affiliation=${AFFILIATION}&archived=false" \
           | jq -r '.full_name')"
fi

[[ -z "$repos" ]] && { log "No accessible repositories found."; exit 0; }

for slug in $repos; do
  owner="${slug%%/*}"; repo="${slug##*/}"
  log "Repo ${owner}/${repo}"

  # Open pull requests
  while IFS= read -r pr; do
    [[ -z "$pr" ]] && continue
    review_pr "$owner" "$repo" \
      "$(jq -r '.number'   <<<"$pr")" \
      "$(jq -r '.title'    <<<"$pr")" \
      "$(jq -r '.head.sha' <<<"$pr")"
  done < <(gh_get_all "/repos/${owner}/${repo}/pulls?state=open")

  # Open issues (the issues endpoint also returns PRs; filter those out via .pull_request)
  if [[ "$INCLUDE_ISSUES" == "1" ]]; then
    while IFS= read -r issue; do
      [[ -z "$issue" ]] && continue
      [[ "$(jq -r 'has("pull_request")' <<<"$issue")" == "true" ]] && continue
      triage_issue "$owner" "$repo" \
        "$(jq -r '.number'      <<<"$issue")" \
        "$(jq -r '.title'       <<<"$issue")" \
        "$(jq -r '.updated_at'  <<<"$issue")" \
        "$(jq -r '.body // ""'  <<<"$issue")"
    done < <(gh_get_all "/repos/${owner}/${repo}/issues?state=open")
  fi
done

log "Done."
