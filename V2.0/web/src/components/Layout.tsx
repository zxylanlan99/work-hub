// 墨研布局壳：左侧栏（8 模块导航）+ 顶栏（当前模块标题 / 用户占位）。
import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { NAV_ITEMS } from "../routes";

export function Layout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const current =
    NAV_ITEMS.find((i) => i.path === pathname) ??
    NAV_ITEMS.find((i) => i.path !== "/" && pathname.startsWith(i.path)) ??
    NAV_ITEMS[0];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          墨研
          <small>StudyMind V2.0 · Ink Scholar</small>
        </div>
        <nav className="nav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === "/"}
              className={({ isActive }) =>
                isActive ? "nav-link active" : "nav-link"
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="topbar-title">{current?.label ?? "墨研"}</div>
          <div className="topbar-user">
            <span className="topbar-avatar">学</span>
            <span>学习者</span>
          </div>
        </header>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
