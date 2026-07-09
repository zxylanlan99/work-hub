"""
智能体对话记忆（验收标准 5 · 记忆持久化 + 隔离）

- 按 agent_id 维度隔离：不同智能体的对话历史互不可见
- 持久化：以 JSON 文件落盘，进程重启后仍可恢复
- 线程安全：内部使用锁保护读写
"""
import os
import json
import threading
from datetime import datetime

# 记忆存储文件（与 backend/ 同目录）
_MEMORY_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.agent_memory.json')


class AgentMemory:
    def __init__(self, path: str = None):
        self.path = path or _MEMORY_PATH
        self._lock = threading.Lock()
        self._data = self._load()

    def _load(self) -> dict:
        try:
            with open(self.path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except (FileNotFoundError, ValueError):
            return {}

    def _save(self):
        tmp = self.path + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(self._data, f, ensure_ascii=False, indent=2)
        os.replace(tmp, self.path)

    def add(self, agent_id: str, role: str, content: str):
        """追加一条对话记录（role: user/assistant/system）"""
        with self._lock:
            self._data.setdefault(agent_id, []).append({
                'role': role,
                'content': content,
                'ts': datetime.now().isoformat()
            })
            self._save()

    def get_history(self, agent_id: str, limit: int = None) -> list:
        """读取某智能体的对话历史；可选 limit 截取其最近 N 条"""
        with self._lock:
            history = list(self._data.get(agent_id, []))
        return history[-limit:] if limit else history

    def clear(self, agent_id: str):
        """清空某智能体的记忆（隔离维度内操作，不影响其他 agent）"""
        with self._lock:
            self._data.pop(agent_id, None)
            self._save()


_memory = None


def get_agent_memory() -> AgentMemory:
    """返回进程级单例记忆存储"""
    global _memory
    if _memory is None:
        _memory = AgentMemory()
    return _memory
