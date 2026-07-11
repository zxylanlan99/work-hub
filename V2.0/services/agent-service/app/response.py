"""统一 API 响应信封（与 data-service / kb-service 保持一致，架构文档 §3 / §10）。

所有成功响应包裹为 ``{code, data, message}``；错误信封由 ``app/main.py``
的异常处理器产生，前端可统一解析单一形状。
"""

from __future__ import annotations

from typing import Any


def ok(data: Any = None, message: str = "ok") -> dict:
    """包裹成功负载。"""
    return {"code": 0, "data": data, "message": message}


def fail(code: int, message: str, data: Any = None) -> dict:
    """包裹错误负载（异常处理器使用）。"""
    return {"code": code, "data": data, "message": message}
