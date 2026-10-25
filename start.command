#!/bin/zsh
set -eu
cd -- "$(dirname -- "$0")"
# Use the system Node, or the already installed Codex runtime on this Mac.
if ! command -v node >/dev/null 2>&1; then
  mathrecall_runtime="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin"
  if [[ -x "$mathrecall_runtime/node" ]]; then
    export PATH="$mathrecall_runtime:$PATH"
  else
    print 'Установите Node.js 24 и pnpm 11.25.0. Инструкция: README.md'
    exit 1
  fi
fi
if [[ ! -f node_modules/vite/bin/vite.js ]]; then
  if command -v pnpm >/dev/null 2>&1; then
    pnpm install --frozen-lockfile
  elif [[ -x "$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm" ]]; then
    "$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm" install --frozen-lockfile
  else
    print 'Установите pnpm: npm install --global pnpm@11.25.0'
    exit 1
  fi
fi
node node_modules/typescript/bin/tsc -b
node node_modules/vite/bin/vite.js build
exec node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port "${MATHRECALL_PORT:-4173}" --strictPort
