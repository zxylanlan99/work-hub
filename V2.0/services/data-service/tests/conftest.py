"""data-service 单元测试公共夹具。

不依赖外部 Postgres：用 SQLite 内存库（StaticPool 保持单连接，避免
in-memory 每次连接新建空库）承载真实表结构与真实 ORM 会话，对路由函数
做「真调用、真落库、真回读」的契约测试（C1：零 mock）。

注意：本文件只负责测试夹具，不 import 任何业务代码，避免污染被测模块。
"""
from __future__ import annotations

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base
import app.models  # noqa: F401  (触发表注册到 Base.metadata，create_all 前必须)


def _make_engine():
    """构造一个独立的 SQLite 内存引擎并建表。"""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )
    # 在共享内存库上建表（Base.metadata 由 app.models 注册）。
    Base.metadata.create_all(bind=engine)
    return engine


pytest_engine = _make_engine()


def pytest_configure(config):  # noqa: D401, ANN001 (pytest hook)
    """确保 app.models 在测试收集前已注册到 Base.metadata。"""
    import app.models  # noqa: F401  (触发表注册)


@pytest.fixture
def db_session():
    """每个测试用例一个真实 SQLite 会话（用完回滚，互相隔离）。"""
    Session = sessionmaker(bind=pytest_engine, future=True)
    session = Session()
    try:
        yield session
    finally:
        session.rollback()
        session.close()
