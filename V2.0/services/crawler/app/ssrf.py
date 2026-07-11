"""R1 · SSRF / 来源防护 (红线第一条).

目标: 爬虫只访问公网 http/https 资源, 严禁访问内网 / 私网 / 保留地址,
避免被用作 SSRF 跳板 (如访问 169.254.169.254 云元数据、127.0.0.1 内部服务等)。

判定流程:
  1. 仅允许 http / https 协议
  2. 禁止 host 为 localhost
  3. 可选: host 必须命中来源白名单 (allowed_hosts)
  4. 解析 host 到所有 IP, 任一 IP 属私网/保留/环回/链路本地/组播/未指定即拒绝

返回值: (safe: bool, reason: str)
"""
from __future__ import annotations

import ipaddress
import socket
from typing import List, Optional, Tuple
from urllib.parse import urlparse

# 额外显式封禁的网段 (ipaddress 内置属性已覆盖绝大部分, 这里补 CGNAT / 未指定等)
_EXTRA_BLOCKED_NETWORKS: List[ipaddress.IPv4Network] = [
    ipaddress.ip_network("0.0.0.0/8"),        # 未指定地址
    ipaddress.ip_network("100.64.0.0/10"),    # CGNAT
    ipaddress.ip_network("192.0.0.0/24"),     # IETF 协议分配
    ipaddress.ip_network("192.0.2.0/24"),     # TEST-NET-1
    ipaddress.ip_network("198.18.0.0/15"),    # 基准测试
    ipaddress.ip_network("198.51.100.0/24"),  # TEST-NET-2
    ipaddress.ip_network("203.0.113.0/24"),   # TEST-NET-3
]


def _resolve_host_ips(host: str) -> List[str]:
    """将 host 解析为 IP 字面量列表; IP 字面量直接返回自身。

    解析失败 (无 DNS) 返回空列表, 调用方据此判定为不安全。
    """
    # IP 字面量直接返回
    try:
        ipaddress.ip_address(host)
        return [host]
    except ValueError:
        pass
    try:
        infos = socket.getaddrinfo(host, None)
    except (socket.gaierror, OSError):
        return []
    ips: List[str] = []
    for info in infos:
        addr = info[4][0].split("%")[0]  # 去掉 IPv6 scope id
        if addr not in ips:
            ips.append(addr)
    return ips


def _is_ip_blocked(ip_str: str) -> bool:
    """判定单个 IP 是否属私网/保留/危险地址。"""
    try:
        ip = ipaddress.ip_address(ip_str)
    except ValueError:
        # 无法解析的地址一律视为不安全
        return True

    if (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_reserved
        or ip.is_multicast
        or ip.is_unspecified
    ):
        return True

    for net in _EXTRA_BLOCKED_NETWORKS:
        # 仅对同版本 IP 做包含判断
        try:
            if ip.version == net.version and ip in net:
                return True
        except TypeError:
            continue
    return False


def check_url_safety(
    url: str, allowed_hosts: Optional[List[str]] = None
) -> Tuple[bool, str]:
    """检查 URL 是否可安全抓取。

    Args:
        url: 待检查地址
        allowed_hosts: 可选来源白名单, 命中其一 (精确或子域) 才放行; 为空表示不限制域名。

    Returns:
        (safe, reason): safe=True 时 reason="ok"
    """
    if not url or not isinstance(url, str):
        return (False, "url 为空")

    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        return (False, f"协议不允许: {parsed.scheme or '(无)'} (仅 http/https)")

    host = parsed.hostname
    if not host:
        return (False, "缺少 host")

    host_lower = host.lower()
    if host_lower == "localhost":
        return (False, "localhost 不允许访问")

    # 来源白名单
    if allowed_hosts:
        allowed = [h.lower().lstrip("*.") for h in allowed_hosts if h]
        matched = any(
            host_lower == a or host_lower.endswith("." + a) for a in allowed
        )
        if not matched:
            return (False, f"域名 {host} 不在来源白名单内")

    # 解析并逐一检查 IP
    ips = _resolve_host_ips(host)
    if not ips:
        return (False, f"无法解析域名: {host}")

    for ip in ips:
        if _is_ip_blocked(ip):
            return (False, f"命中私网/保留地址, 已拦截: {ip}")

    return (True, "ok")
