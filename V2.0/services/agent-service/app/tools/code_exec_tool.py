"""code_exec 工具（默认禁用，C2/C3 安全默认）。

工具白名单包含 ``code_exec``，但出于安全考虑默认不纳入智能体工具集；
仅当 agent-service 配置 ``CODE_EXEC_ENABLED=true`` 时才由
``app/skills.resolve_agent_tools`` 纳入。

未启用时即使被 Skill 引用，该工具也仅返回明确提示，绝不执行任意代码；
MVP 即便在启用态也仅返回禁用提示（真实执行需接入受控沙箱，属后续加固项）。
"""

from __future__ import annotations

from app.config import settings


def code_exec(code: str) -> str:
    """执行一段代码并返回结果（默认禁用，C2/C3）。

    仅当服务端显式开启 ``CODE_EXEC_ENABLED`` 时才会被装配到智能体；
    默认禁用，调用此工具将明确告知用户代码执行未启用。
    """
    if not settings.CODE_EXEC_ENABLED:
        return (
            "[代码执行未启用] 当前环境出于安全考虑默认禁用 code_exec。"
            "如需启用，请在服务端配置 CODE_EXEC_ENABLED=true 并提供受控沙箱。"
        )
    # 安全默认：即便未来启用，也应接入受控沙箱（受限容器 / 超时隔离 / 资源限额）。
    # MVP 不实现真实执行，避免任意代码执行（RCE）风险。
    return "[代码执行未启用] code_exec 在 MVP 中不执行任意代码。"
