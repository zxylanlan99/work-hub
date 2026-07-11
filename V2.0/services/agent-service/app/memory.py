"""会话记忆存储（MVP）。

隔离维度：conversation_id（不同会话互不可见，满足 C1）。
存储：进程内 dict + 可选 JSON 落盘。

说明：
- 生产环境应将历史持久化到 data-service（T02 当前未建会话表，故 MVP 自存）。
- 记忆隔离不变量：每个 conversation_id 的读写仅作用于自身桶，绝不跨会话串扰。
"""

from __future__ import annotations

import json
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.config import settings


@dataclass
class _Message:
    role: str  # "user" | "assistant"
    content: str
    ts: float = field(default_factory=time.time)

    def to_dict(self) -> Dict[str, Any]:
        return {"role": self.role, "content": self.content, "ts": self.ts}


@dataclass
class _Conversation:
    conversation_id: str
    agent_id: str
    messages: List[_Message] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "conversation_id": self.conversation_id,
            "agent_id": self.agent_id,
            "messages": [m.to_dict() for m in self.messages],
        }


class ConversationMemory:
    """按 conversation_id 隔离的会话记忆存储（线程安全）。"""

    def __init__(self, persist_path: Optional[str] = None) -> None:
        self._store: Dict[str, _Conversation] = {}
        self._lock = threading.Lock()
        self._persist_path = Path(persist_path) if persist_path else None
        if self._persist_path:
            self._load()

    def _ensure(self, conversation_id: str, agent_id: str) -> _Conversation:
        conv = self._store.get(conversation_id)
        if conv is None:
            conv = _Conversation(conversation_id=conversation_id, agent_id=agent_id)
            self._store[conversation_id] = conv
        return conv

    def add(self, conversation_id: str, agent_id: str, role: str, content: str) -> None:
        """向指定会话追加一条消息（仅写入该 conversation_id 的桶，保证隔离）。"""
        with self._lock:
            conv = self._ensure(conversation_id, agent_id)
            conv.messages.append(_Message(role=role, content=content))
            self._save()

    def history(self, conversation_id: str) -> List[Dict[str, Any]]:
        """返回指定会话的消息列表（若无则返回空列表）。"""
        with self._lock:
            conv = self._store.get(conversation_id)
            if conv is None:
                return []
            return [m.to_dict() for m in conv.messages]

    def get(self, conversation_id: str) -> Optional[Dict[str, Any]]:
        """返回含 agent_id 的完整会话快照；不存在返回 None。"""
        with self._lock:
            conv = self._store.get(conversation_id)
            if conv is None:
                return None
            return conv.to_dict()

    def exists(self, conversation_id: str) -> bool:
        with self._lock:
            return conversation_id in self._store

    def clear(self, conversation_id: str) -> None:
        """清除指定会话（如用户主动结束对话）。"""
        with self._lock:
            self._store.pop(conversation_id, None)
            self._save()

    def _save(self) -> None:
        if not self._persist_path:
            return
        try:
            data = {cid: c.to_dict() for cid, c in self._store.items()}
            self._persist_path.write_text(
                json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
            )
        except Exception:
            # 落盘失败不影响内存会话（MVP 容错）
            pass

    def _load(self) -> None:
        if not self._persist_path or not self._persist_path.exists():
            return
        try:
            data = json.loads(self._persist_path.read_text(encoding="utf-8"))
            for cid, c in data.items():
                self._store[cid] = _Conversation(
                    conversation_id=c["conversation_id"],
                    agent_id=c.get("agent_id", ""),
                    messages=[
                        _Message(
                            role=m["role"],
                            content=m["content"],
                            ts=m.get("ts", 0.0),
                        )
                        for m in c.get("messages", [])
                    ],
                )
        except Exception:
            # 损坏的落盘文件不影响启动
            pass


# 全局单例：进程内会话记忆（C1：按 conversation_id 隔离）。
# 生产应将此替换为 data-service 持久化实现。
memory = ConversationMemory(persist_path=settings.CONVERSATION_PERSIST_PATH or None)
