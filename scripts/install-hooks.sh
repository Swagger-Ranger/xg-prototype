#!/usr/bin/env bash
# One-time per clone: tell git to use the in-repo .githooks dir.
# After running this, hooks under .githooks/ fire on commit/push as usual.
set -euo pipefail

ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"

git config core.hooksPath .githooks
chmod +x .githooks/* 2>/dev/null || true

echo "core.hooksPath → .githooks"
echo "Active hooks:"
ls .githooks
