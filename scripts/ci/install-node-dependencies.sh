#!/usr/bin/env bash
set -euo pipefail

if [[ -f package-lock.json ]]; then
  echo "::notice::Installing root dependencies with npm ci."
  npm ci
else
  echo "::notice::No root package-lock.json; installing root dependencies without generating a lockfile."
  npm install --package-lock=false
fi

if [[ ! -f backend/package-lock.json ]]; then
  echo "backend/package-lock.json is required for reproducible backend checks." >&2
  exit 1
fi

npm --prefix backend ci

node -e "console.log(require.resolve('jose', { paths: ['./backend'] }))"
