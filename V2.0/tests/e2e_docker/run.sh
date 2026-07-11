#!/usr/bin/env bash
# StudyMind V2.0 —— docker 端到端验证入口脚本
#
# 用法：
#   bash tests/e2e_docker/run.sh            # 自动 docker compose up --profile backend
#                                            # → 跑探针（轮询 /health → pytest）→ down -v
#   bash tests/e2e_docker/run.sh --no-up   # 假设服务已手动起好，仅跑探针
#
# 说明：
#   * 全套 docker 生命周期（up / 轮询 / down）由 pytest 的 docker_stack
#     会话夹具托管（见 conftest.py）；本脚本只负责切到仓库根并转发 --no-up。
#   * 依赖（在宿主机 / CI runner 上，而非容器内）：pytest、requests、docker。
#   * 起不全（PG/FastGPT/Qdrant 重 / OOM / 代理失败）时，相关探针自动
#     SKIP，绝不伪造 PASS。退出码透传自 pytest。
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT" || exit 1

ARGS=()
if [ "${1:-}" = "--no-up" ]; then
  ARGS+=("--no-up")
fi

python3 -m pytest tests/e2e_docker/ -v "${ARGS[@]}"
exit $?
