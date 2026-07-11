"""基于 Agno 的 LLM 客户端（OpenAI 兼容）。

设计要点：
- 仅在此服务持有 LLM 密钥与调用（C3 硬约束：密钥仅 agent-service）。
- 使用 env 的 LLM_BASE_URL / LLM_MODEL_NAME / LLM_API_KEY。
- base_url 或 api_key 缺失时抛出清晰的错误（而非崩溃 /  obscure traceback）。
- agno 的 import 放在函数内部，确保即使未安装 agno，本模块也可被 import（便于静态检查）。
"""

from __future__ import annotations

from app.config import settings


class LLMConfigurationError(Exception):
    """LLM 未正确配置时抛出，由路由层转换为 503 友好错误。"""


def get_model():
    """构建 Agno LLM 模型客户端（OpenAI 兼容）。

    Returns:
        agno.models.base.Model: 可用于 Agent(model=...) 的模型实例。

    Raises:
        LLMConfigurationError: 当 LLM_API_KEY 或 LLM_BASE_URL 未配置时，
            给出明确引导（而非在底层 SDK 抛混乱错误）。
    """
    api_key = settings.LLM_API_KEY
    base_url = settings.LLM_BASE_URL
    model_name = settings.LLM_MODEL_NAME or "gpt-4o"

    if not api_key:
        raise LLMConfigurationError(
            "未配置 LLM_API_KEY。请在 deploy/.env 中设置 LLM_API_KEY 后再启动 agent-service。"
        )
    if not base_url:
        raise LLMConfigurationError(
            "未配置 LLM_BASE_URL（OpenAI 兼容接口地址）。\n"
            "请在 deploy/.env 中设置 LLM_BASE_URL，例如：\n"
            "  - OpenAI:        https://api.openai.com/v1\n"
            "  - 国内厂商/Coding Plan: 对应 OpenAI 兼容网关地址\n"
            "  - 本地 Ollama:   http://localhost:11434/v1"
        )

    try:
        from agno.models.openai import OpenAIChat
    except ImportError as exc:  # pragma: no cover - 依赖缺失
        raise LLMConfigurationError(
            "未安装 agno，请先执行：pip install -r requirements.txt"
        ) from exc

    # 当前 Agno 的 OpenAIChat 使用 base_url 参数（OpenAI 兼容网关地址）。
    # 极旧版本可能使用 api_base，故在 TypeError 时回退。
    try:
        model = OpenAIChat(id=model_name, api_key=api_key, base_url=base_url)
    except TypeError:
        model = OpenAIChat(id=model_name, api_key=api_key, api_base=base_url)

    return model
