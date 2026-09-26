#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1 || {
  echo "Node.js and npm are required. Use the version in .nvmrc or a newer supported Node.js release." >&2
  exit 1
}
node -e 'const [major, minor] = process.versions.node.split(".").map(Number); if (major < 22 || (major === 22 && minor < 18)) { console.error("Node.js 22.18 or newer is required for the TypeScript tests."); process.exit(1); }'

# This fork has two personal development extensions. Do not install the whole
# upstream extension catalog or launch Raycast commands during worktree setup.
for extension in deepcast stealth-ai-tool; do
  (
    cd "extensions/$extension"
    CI=true npm ci --no-audit --no-fund
    CI=true npm run build
  )
done
(cd extensions/deepcast && CI=true npm test)
echo "Raycast extensions worktree is ready."
