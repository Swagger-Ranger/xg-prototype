#!/usr/bin/env bash
# Local equivalent of .github/workflows/ci.yml — run before pushing.
# Stops at the first failure.

set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)

# Auto-detect JAVA_HOME (prefer JDK 17). On macOS /usr/bin/java is a stub that
# fails when no JDK is installed, so we test by actually running java -version.
if ! java -version >/dev/null 2>&1; then
  for candidate in \
    /opt/homebrew/Cellar/openjdk@17/*/libexec/openjdk.jdk/Contents/Home \
    /usr/lib/jvm/temurin-17-jdk-* \
    /usr/lib/jvm/java-17-openjdk \
    /Library/Java/JavaVirtualMachines/*/Contents/Home; do
    if [ -d "$candidate" ] && [ -x "$candidate/bin/java" ]; then
      export JAVA_HOME="$candidate"
      export PATH="$JAVA_HOME/bin:$PATH"
      echo "Auto-detected JAVA_HOME=$JAVA_HOME"
      break
    fi
  done
fi

echo "==> [1/5] Java tests (xg-business)"
cd "$ROOT/xg-backend"
./gradlew :xg-business:test --no-daemon

echo "==> [2/5] Python tests (xg-ai)"
cd "$ROOT/xg-ai"
if [ -d .venv ]; then
  source .venv/bin/activate
fi
python -m pytest tests/ -q

echo "==> [3/5] Web tsc"
cd "$ROOT/xg-frontend/apps/web"
pnpm exec tsc --noEmit

echo "==> [4/5] Web vitest"
pnpm test

echo "==> [5/5] Mini tsc"
cd "$ROOT/xg-frontend/apps/mini"
pnpm exec tsc --noEmit

echo
echo "All checks passed."
