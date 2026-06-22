#!/bin/bash
# StudyMind 知识库后端启动脚本
# 用法: ./start.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "=========================================="
echo "  StudyMind 知识库后端启动"
echo "=========================================="

# 检查 Python
PYTHON="${SCRIPT_DIR}/.venv/bin/python"
if [ ! -f "$PYTHON" ]; then
    echo "首次运行，创建虚拟环境..."
    python3 -m venv .venv
    PYTHON="${SCRIPT_DIR}/.venv/bin/python"
fi

# 安装依赖
echo "检查依赖..."
"$PYTHON" -m pip install -q -r requirements.txt 2>&1 | tail -5

# 启动服务
echo ""
echo "启动服务: http://localhost:8765"
echo "API 文档: http://localhost:8765/docs"
echo "按 Ctrl+C 停止"
echo "=========================================="

exec "$PYTHON" app.py
