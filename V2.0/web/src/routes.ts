// Central route constants for the 8 StudyMind modules (墨研 layout).

export const ROUTES = {
  HOME: "/",
  PLAN: "/plan",
  NEWS: "/news",
  KNOWLEDGE: "/knowledge",
  AGENTS: "/agents",
  REVIEW: "/review",
  SEDIMENTATION: "/sedimentation",
  SETTINGS: "/settings",
} as const;

export interface NavItem {
  path: string;
  label: string;
}

export const NAV_ITEMS: NavItem[] = [
  { path: ROUTES.HOME, label: "首页" },
  { path: ROUTES.PLAN, label: "学习计划" },
  { path: ROUTES.NEWS, label: "资讯" },
  { path: ROUTES.KNOWLEDGE, label: "知识库" },
  { path: ROUTES.AGENTS, label: "智能体中心" },
  { path: ROUTES.REVIEW, label: "复习计划" },
  { path: ROUTES.SEDIMENTATION, label: "知识沉淀" },
  { path: ROUTES.SETTINGS, label: "系统设置" },
];
