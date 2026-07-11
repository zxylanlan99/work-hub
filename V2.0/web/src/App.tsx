import React from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { NAV_ITEMS, ROUTES } from "./routes";

// Wave 1 scaffold shell (墨研 / Ink Scholar design language).
// Each module renders a placeholder; business logic arrives in T09-T15.
// Data will be fetched from the real data-service (C1 forbids mocks).

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        fontFamily: "'Noto Sans SC', system-ui, sans-serif",
        color: "#211C16",
      }}
    >
      <aside
        style={{
          width: 220,
          flexShrink: 0,
          background: "#F6F3EC",
          borderRight: "1px solid #E4DDD0",
          padding: "24px 16px",
        }}
      >
        <div
          style={{
            fontFamily: "'Noto Serif SC', serif",
            fontSize: 20,
            fontWeight: 700,
            color: "#2F6B4F",
            marginBottom: 24,
          }}
        >
          墨研 · StudyMind
        </div>
        <nav style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === "/"}
              style={({ isActive }) => ({
                padding: "8px 12px",
                borderRadius: 6,
                textDecoration: "none",
                color: isActive ? "#FFFFFF" : "#211C16",
                background: isActive ? "#2F6B4F" : "transparent",
                fontSize: 14,
              })}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main style={{ flex: 1, padding: 32 }}>
        <header
          style={{
            borderBottom: "1px solid #E4DDD0",
            paddingBottom: 16,
            marginBottom: 24,
          }}
        >
          <span style={{ fontSize: 14, color: "#C8772E" }}>
            StudyMind V2.0 · 脚手架占位（数据来自真实 data-service）
          </span>
        </header>
        {children}
      </main>
    </div>
  );
}

function Page({ title, desc }: { title: string; desc: string }) {
  return (
    <section>
      <h1 style={{ fontFamily: "'Noto Serif SC', serif", fontSize: 28, margin: 0 }}>
        {title}
      </h1>
      <p style={{ color: "#6B6358", marginTop: 8 }}>{desc}</p>
      <div
        style={{
          marginTop: 24,
          padding: 24,
          background: "#FFFFFF",
          border: "1px solid #E4DDD0",
          borderRadius: 8,
          color: "#6B6358",
        }}
      >
        模块骨架已就绪（T09–T15 将在此实现业务）。所有数据通过真实接口从
        data-service 获取，前端不写死任何 mock 数据（C1）。
      </div>
    </section>
  );
}

export default function App() {
  return (
    <Shell>
      <Routes>
        <Route
          path={ROUTES.HOME}
          element={
            <Page
              title="首页"
              desc="学习仪表盘：热力图 / 待复习 / 薄弱主题 / 计划统计"
            />
          }
        />
        <Route
          path={ROUTES.PLAN}
          element={
            <Page
              title="学习计划"
              desc="目标 / 里程碑 / 任务，由规划师智能体协作生成"
            />
          }
        />
        <Route
          path={ROUTES.NEWS}
          element={
            <Page
              title="资讯"
              desc="资讯爬取 / 红线通过-拦截 / 收藏 / 已读"
            />
          }
        />
        <Route
          path={ROUTES.KNOWLEDGE}
          element={
            <Page title="知识库" desc="文档上传 / 条目列表 / 分类管理" />
          }
        />
        <Route
          path={ROUTES.AGENTS}
          element={
            <Page title="智能体中心" desc="内置 + 自定义智能体 / Skill 库" />
          }
        />
        <Route
          path={ROUTES.REVIEW}
          element={
            <Page
              title="复习计划"
              desc="SM-2 排程 / 基础出题(choice·fill·qa)"
            />
          }
        />
        <Route
          path={ROUTES.SEDIMENTATION}
          element={
            <Page
              title="知识沉淀"
              desc="TipTap 单面编辑器 / 大纲成稿 / 润色"
            />
          }
        />
        <Route
          path={ROUTES.SETTINGS}
          element={
            <Page
              title="系统设置"
              desc="模型配置 + RSS 源管理 + 红线规则"
            />
          }
        />
        <Route
          path="*"
          element={<Page title="页面未找到" desc="未知路由" />}
        />
      </Routes>
    </Shell>
  );
}
