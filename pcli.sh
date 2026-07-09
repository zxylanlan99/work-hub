#!/bin/bash
# playwright-cli wrapper: resolves `playwright` module from project node_modules
# and uses the macOS default browser cache path.
export NODE_PATH="/Users/zouxiaoyong/Desktop/学习资料/StudyMind_TRAE_V1.1/node_modules"
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/Users/zouxiaoyong/Library/Caches/ms-playwright}"
exec node "/Users/zouxiaoyong/.workbuddy/plugins/marketplaces/codebuddy-plugins-official/plugins/playwright-cli/playwright-cli.js" "$@"
