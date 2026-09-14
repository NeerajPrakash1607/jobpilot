#!/bin/zsh
cd "${0:A:h}" || exit 1
if command -v node >/dev/null 2>&1; then
  JOBPILOT_NODE="$(command -v node)"
else
  JOBPILOT_NODE="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
fi
if [[ ! -x "$JOBPILOT_NODE" ]]; then
  print 'Install Node.js 22.16 or newer, then open this launcher again.'
  exit 1
fi
exec "$JOBPILOT_NODE" server.mjs
