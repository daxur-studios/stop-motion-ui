#!/usr/bin/env bash
# Heuristic first pass: find likely-interactive elements with no visible test-id attribute nearby.
# Not authoritative — skim the surrounding code for anything this flags before reporting it.
#
# Usage: find_missing_testids.sh <path-to-repo-or-src-dir>

set -euo pipefail

TARGET="${1:-.}"

if ! command -v rg >/dev/null 2>&1; then
  echo "ripgrep (rg) is required but not found on PATH." >&2
  exit 1
fi

echo "# Interactive elements (line-level matches)"
echo "# Review each — this does not confirm a testid is missing, only that one isn't on the same line."
echo

rg -n --no-heading \
  -e '<button' \
  -e '<a\s' \
  -e '<input' \
  -e 'onClick=' \
  -e 'onPress=' \
  -e 'role="button"' \
  -e '@click' \
  -e 'on:click' \
  "$TARGET" \
  | grep -viE 'data-testid|data-stopmotion-id|data-cy|data-test' \
  || echo "No obvious misses found by this pass."
