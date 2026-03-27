#!/bin/bash
# 本地开发服务器启动脚本
# 用法：在终端执行 ./dev.sh 或 bash dev.sh

PORT=8080
DIR="$(cd "$(dirname "$0")" && pwd)"

echo "================================================"
echo "  华力集团研策部周报系统 - 本地开发服务器"
echo "================================================"
echo ""
echo "  📁 目录：$DIR"
echo "  🌐 地址：http://localhost:$PORT"
echo "  🌐 门户：http://localhost:$PORT/portal.html"
echo "  🌐 周报：http://localhost:$PORT/index_fixed.html"
echo ""
echo "  按 Ctrl+C 停止服务器"
echo "================================================"
echo ""

cd "$DIR"
python3 -m http.server $PORT
