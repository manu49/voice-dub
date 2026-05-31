#!/usr/bin/env bash
# Shared GitHub REST helpers for the review agent.
#
# Deliberately read-mostly: the only write operation exposed here posts a
# *comment*. There is intentionally NO function that merges, approves, closes, or
# otherwise mutates a PR/issue — the agent's contract is "review + comment only",
# and that guarantee is enforced by simply not providing the capability.
#
# Requires: bash, curl, jq.
# Env: GITHUB_TOKEN (required), GITHUB_API (default https://api.github.com).

set -euo pipefail

GITHUB_API="${GITHUB_API:-https://api.github.com}"
API="${GITHUB_API%/}"

_curl() {
  curl --fail --silent --show-error \
    --header "Authorization: Bearer ${GITHUB_TOKEN:?GITHUB_TOKEN is required}" \
    --header "X-GitHub-Api-Version: 2022-11-28" \
    --header "Accept: application/vnd.github+json" "$@"
}

# gh_get <path-starting-with-slash> [extra curl args...]
gh_get() {
  local path="$1"; shift || true
  _curl "$@" "${API}${path}"
}

# gh_get_diff <path> — fetch a resource as a unified diff.
gh_get_diff() {
  _curl --header "Accept: application/vnd.github.v3.diff" "${API}$1"
}

# gh_post_json <path> <json-body>
gh_post_json() {
  _curl --request POST --header "Content-Type: application/json" \
    --data "$2" "${API}$1" >/dev/null
}

# gh_get_all <path> — paginate a JSON-array list endpoint, stream each element
# as compact JSON. Appends per_page/page using ? or & as appropriate.
gh_get_all() {
  local path="$1" page=1 sep body count
  [[ "$path" == *\?* ]] && sep="&" || sep="?"
  while :; do
    body="$(gh_get "${path}${sep}per_page=100&page=${page}")"
    count="$(jq 'length' <<<"$body")"
    [[ "$count" -eq 0 ]] && break
    jq -c '.[]' <<<"$body"
    [[ "$count" -lt 100 ]] && break
    page=$((page + 1))
  done
}

# Post a comment on a PR or issue (same endpoint on GitHub):
#   post_comment <owner> <repo> <number> <body>
post_comment() {
  gh_post_json "/repos/$1/$2/issues/$3/comments" \
    "$(jq -n --arg b "$4" '{body: $b}')"
}

# Idempotency: does this PR/issue already have a comment containing <marker>?
#   has_marker <owner> <repo> <number> <marker>
has_marker() {
  gh_get "/repos/$1/$2/issues/$3/comments?per_page=100" \
    | jq -e --arg m "$4" 'any(.[]; .body | contains($m))' >/dev/null 2>&1
}
