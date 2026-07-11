"""docker 端到端验证套件 —— 公共夹具。

职责：
  * 提供 ``--no-up`` 选项：假设服务已由外部手动起好，跳过 compose up/down
    （便于 CI 分段：构建/起栈一步，跑测试另一步）。
  * ``docker_stack`` 会话级夹具：默认执行
        docker compose -f deploy/docker-compose.yml --profile backend up -d
    → 轮询 data 服务 /health 至就绪或超时 → 交还测试 → 收尾 down -v。
  * 若 compose 根本起不来（无 docker daemon / 镜像缺失 / OOM / 代理失败），
    整个会话 SKIP，而不是伪造任何 PASS。

依赖（在「宿主机 / CI runner」上，而非容器内）：pytest、requests、docker。
"""
from __future__ import annotations

import subprocess
import time

import pytest

REPO_ROOT = __file__ and __import__("pathlib").Path(__file__).resolve().parents[2]
COMPOSE_FILE = REPO_ROOT / "deploy" / "docker-compose.yml"
HEALTH_TIMEOUT = 180  # 秒，等 data 服务就绪


def pytest_addoption(parser: pytest.Parser) -> None:
    parser.addoption(
        "--no-up",
        action="store_true",
        default=False,
        help="Assume services already running; skip docker compose up/down.",
    )


def _compose_up() -> None:
    subprocess.run(
        [
            "docker",
            "compose",
            "-f",
            str(COMPOSE_FILE),
            "--profile",
            "backend",
            "up",
            "-d",
        ],
        check=True,
        capture_output=True,
        text=True,
    )


def _compose_down() -> None:
    subprocess.run(
        ["docker", "compose", "-f", str(COMPOSE_FILE), "down", "-v"],
        check=False,
        capture_output=True,
        text=True,
    )


def _wait_data_health(timeout: int = HEALTH_TIMEOUT) -> bool:
    """轮询 data 服务 /health，就绪返回 True，超时返回 False。"""
    import requests

    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            r = requests.get("http://localhost:8000/health", timeout=5)
            if r.status_code == 200:
                return True
        except Exception:  # noqa: BLE001 — 任何连接异常都视为未就绪
            pass
        time.sleep(3)
    return False


@pytest.fixture(scope="session")
def docker_stack(request: pytest.FixtureRequest):
    """托管整套 docker 栈的生命周期（除非 ``--no-up``）。

    起不来则整会话 SKIP；data 服务始终就绪后再交出，其余服务由各探针
    自身 try/except 兜底（未就绪即 SKIP，绝不伪造 PASS）。
    """
    no_up = request.config.getoption("--no-up")
    if no_up:
        yield
        return
    try:
        _compose_up()
    except (subprocess.CalledProcessError, FileNotFoundError) as exc:
        pytest.skip(f"需完整 docker 环境：无法启动 compose 栈（{exc}）")

    if not _wait_data_health():
        _compose_down()
        pytest.skip("需完整 docker 环境：data 服务在超时内未就绪")

    try:
        yield
    finally:
        _compose_down()
