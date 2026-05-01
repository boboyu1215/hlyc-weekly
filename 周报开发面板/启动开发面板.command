#!/bin/bash
PANEL_DIR="$(cd "$(dirname "$0")" && pwd)"
export PATH="$HOME/.nvm/versions/node/v24.13.0/bin:$PATH"
pm2 start "$PANEL_DIR/deploy-server.cjs" --name deploy-panel 2>/dev/null || pm2 restart deploy-panel 2>/dev/null
sleep 1
open http://localhost:3006
