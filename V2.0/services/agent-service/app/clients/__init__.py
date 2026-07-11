"""agent-service 的服务间客户端集合。

当前仅包含 data-service 客户端（自定义 Skill / 自定义智能体 CRUD，
T04）。所有客户端统一使用异步 httpx，超时 <=45s 且不重试（防烧 token）。
"""
