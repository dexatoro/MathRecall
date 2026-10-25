#!/bin/zsh
set -eu
cd -- "$(dirname -- "$0")"

# Finder may not inherit the Homebrew PATH from an interactive shell.
if ! command -v node >/dev/null 2>&1; then
  for mathrecall_bin in /opt/homebrew/bin /usr/local/bin; do
    if [[ -x "$mathrecall_bin/node" ]]; then
      export PATH="$mathrecall_bin:$PATH"
      break
    fi
  done
fi

if ! command -v node >/dev/null 2>&1; then
  print -u2 'Не найден Node.js. Установите Node.js 24 и pnpm 11.25.0 по инструкции в README.md.'
  exit 1
fi

if [[ ! -f node_modules/vite/bin/vite.js ]]; then
  if ! command -v pnpm >/dev/null 2>&1; then
    print -u2 'Не найден pnpm. Выполните: npm install --global pnpm@11.25.0'
    exit 1
  fi
  pnpm install --frozen-lockfile
fi

node node_modules/typescript/bin/tsc -b
node node_modules/vite/bin/vite.js build
exec node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port "${MATHRECALL_PORT:-4173}" --strictPort
