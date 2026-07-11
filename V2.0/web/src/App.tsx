import React from "react";
import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ROUTES } from "./routes";
import HomePage from "./pages/HomePage";
import PlanPage from "./pages/PlanPage";
import NewsPage from "./pages/NewsPage";
import KnowledgePage from "./pages/KnowledgePage";
import AgentsPage from "./pages/AgentsPage";
import ReviewPage from "./pages/ReviewPage";
import SedimentationPage from "./pages/SedimentationPage";
import SettingsPage from "./pages/SettingsPage";
import { Card, CardBody } from "./components/ui";

function NotFound() {
  return (
    <Card>
      <CardBody>
        <h1>页面未找到</h1>
        <p className="muted">未知路由。</p>
      </CardBody>
    </Card>
  );
}

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path={ROUTES.HOME} element={<HomePage />} />
        <Route path={ROUTES.PLAN} element={<PlanPage />} />
        <Route path={ROUTES.NEWS} element={<NewsPage />} />
        <Route path={ROUTES.KNOWLEDGE} element={<KnowledgePage />} />
        <Route path={ROUTES.AGENTS} element={<AgentsPage />} />
        <Route path={ROUTES.REVIEW} element={<ReviewPage />} />
        <Route path={ROUTES.SEDIMENTATION} element={<SedimentationPage />} />
        <Route path={ROUTES.SETTINGS} element={<SettingsPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Layout>
  );
}
