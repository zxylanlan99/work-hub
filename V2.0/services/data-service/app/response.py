"""Unified API response envelope.

All success responses are wrapped as ``{code, data, message}`` (architecture
doc §3 / §10). Error envelopes are produced by the exception handlers in
``app/main.py`` so the frontend can parse a single consistent shape.
"""
from __future__ import annotations

from typing import Any


def ok(data: Any = None, message: str = "ok") -> dict:
    """Wrap a successful payload."""
    return {"code": 0, "data": data, "message": message}


def fail(code: int, message: str, data: Any = None) -> dict:
    """Wrap an error payload (used by exception handlers)."""
    return {"code": code, "data": data, "message": message}
