// 学习计划（T10，保留清单 #4 / V2-PLAN-001）
// 目标/里程碑/任务 CRUD，并由「学习规划师」智能体协作生成草案。
import React, { useState } from "react";
import { plansApi } from "../lib/api/plans";
import { agentsApi } from "../lib/api/agents";
import { useAsyncData } from "../lib/async";
import {
  Card,
  CardHead,
  CardBody,
  Button,
  Field,
  Input,
  Textarea,
  Select,
  Toggle,
  Modal,
  Banner,
  Badge,
  Spinner,
  Empty,
} from "../components/ui";
import type { StudyGoal, StudyMilestone, StudyTask } from "../types";

export default function PlanPage() {
  const { data, loading, error, reload } = useAsyncData<StudyGoal[]>(
    () => plansApi.listGoals(),
    []
  );
  const [showGoal, setShowGoal] = useState(false);
  const [goalForm, setGoalForm] = useState({ title: "", description: "", target_date: "" });
  const [saving, setSaving] = useState(false);

  // 规划师生成
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [plannerInput, setPlannerInput] = useState("");
  const [plannerDraft, setPlannerDraft] = useState("");
  const [plannerBusy, setPlannerBusy] = useState(false);
  const [plannerErr, setPlannerErr] = useState<string | null>(null);

  const goals = data ?? [];

  async function saveGoal() {
    if (!goalForm.title.trim()) return;
    setSaving(true);
    try {
      await plansApi.createGoal({
        title: goalForm.title.trim(),
        description: goalForm.description.trim(),
        target_date: goalForm.target_date ? goalForm.target_date : null,
      });
      setShowGoal(false);
      setGoalForm({ title: "", description: "", target_date: "" });
      reload();
    } finally {
      setSaving(false);
    }
  }

  async function askPlanner() {
    if (!plannerInput.trim()) return;
    setPlannerBusy(true);
    setPlannerErr(null);
    setPlannerDraft("");
    try {
      const res = await agentsApi.chat("planner", {
        message: `请为以下学习目标生成学习计划草案（含里程碑与任务，使用 JSON 结构）：\n${plannerInput}`,
      });
      setPlannerDraft(res.reply);
    } catch (e) {
      setPlannerErr(e instanceof Error ? e.message : String(e));
    } finally {
      setPlannerBusy(false);
    }
  }

  async function removeGoal(id: number) {
    await plansApi.removeGoal(id);
    reload();
  }
  async function toggleMilestone(goal: StudyGoal, m: StudyMilestone) {
    await plansApi.updateMilestone(goal.id, m.id, { done: !m.done });
    reload();
  }
  async function toggleTask(goal: StudyGoal, m: StudyMilestone, t: StudyTask) {
    await plansApi.updateTask(goal.id, m.id, t.id, { done: !t.done });
    reload();
  }

  const totalTasks = goals.reduce(
    (s, g) => s + (g.milestones ?? []).reduce((s2, m) => s2 + (m.tasks ?? []).length, 0),
    0
  );
  const doneTasks = goals.reduce(
    (s, g) =>
      s +
      (g.milestones ?? []).reduce(
        (s2, m) => s2 + (m.tasks ?? []).filter((t) => t.done).length,
        0
      ),
    0
  );

  return (
    <div>
      <div className="page-head">
        <h1>学习计划</h1>
        <p>
          目标 / 里程碑 / 任务 · 可由「学习规划师」智能体协作生成（共 {goals.length} 个目标，
          {doneTasks}/{totalTasks} 任务完成）
        </p>
      </div>

      <div className="row row-between" style={{ marginBottom: 16 }}>
        <Button onClick={() => setShowGoal(true)}>+ 新建目标</Button>
        <Button variant="secondary" onClick={() => setPlannerOpen(true)}>
          让规划师帮我规划
        </Button>
      </div>

      {loading ? (
        <Spinner center />
      ) : error ? (
        <Banner kind="error">加载失败：{error}（请确认 data-service :8000 已启动）</Banner>
      ) : goals.length === 0 ? (
        <Empty title="还没有学习目标" hint="点击「新建目标」或「让规划师帮我规划」。" />
      ) : (
        <div className="list">
          {goals.map((g) => (
            <Card key={g.id}>
              <CardHead
                title={g.title}
                extra={
                  <Button variant="ghost" size="sm" onClick={() => removeGoal(g.id)}>
                    删除
                  </Button>
                }
              />
              <CardBody>
                {g.description ? <p className="muted" style={{ marginTop: 0 }}>{g.description}</p> : null}
                <div className="row" style={{ marginBottom: 12 }}>
                  <Badge tone={g.status === "done" ? "bamboo" : "amber"}>{g.status || "active"}</Badge>
                  {g.target_date ? <span className="muted">目标日期 {g.target_date.slice(0, 10)}</span> : null}
                </div>
                {(g.milestones ?? []).length === 0 ? (
                  <div className="muted">暂无里程碑。</div>
                ) : (
                  <ul className="tree">
                    {(g.milestones ?? []).map((m) => (
                      <li key={m.id}>
                        <div className="tree-row">
                          <Toggle checked={m.done} onChange={() => toggleMilestone(g, m)} label="完成里程碑" />
                          <span className={m.done ? "muted" : ""} style={{ fontWeight: 600 }}>
                            {m.title}
                          </span>
                          {m.due_date ? <span className="muted">· {m.due_date.slice(0, 10)}</span> : null}
                        </div>
                        {(m.tasks ?? []).length > 0 ? (
                          <ul>
                            {(m.tasks ?? []).map((t) => (
                              <li key={t.id}>
                                <div className="tree-row">
                                  <Toggle checked={t.done} onChange={() => toggleTask(g, m, t)} label="完成任务" />
                                  <span className={t.done ? "muted" : ""}>{t.title}</span>
                                  {t.due_date ? <span className="muted">· {t.due_date.slice(0, 10)}</span> : null}
                                </div>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {/* 新建目标弹窗 */}
      {showGoal && (
        <Modal
          title="新建学习目标"
          onClose={() => setShowGoal(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setShowGoal(false)}>
                取消
              </Button>
              <Button onClick={saveGoal} disabled={saving || !goalForm.title.trim()}>
                {saving ? "保存中…" : "保存"}
              </Button>
            </>
          }
        >
          <Field label="目标标题">
            <Input
              value={goalForm.title}
              onChange={(e) => setGoalForm({ ...goalForm, title: e.target.value })}
              placeholder="例如：三个月内掌握 React 进阶"
            />
          </Field>
          <Field label="描述">
            <Textarea
              value={goalForm.description}
              onChange={(e) => setGoalForm({ ...goalForm, description: e.target.value })}
              placeholder="可选"
            />
          </Field>
          <Field label="目标日期">
            <Input
              type="date"
              value={goalForm.target_date}
              onChange={(e) => setGoalForm({ ...goalForm, target_date: e.target.value })}
            />
          </Field>
        </Modal>
      )}

      {/* 规划师弹窗 */}
      {plannerOpen && (
        <Modal
          title="学习规划师"
          onClose={() => setPlannerOpen(false)}
          footer={
            <Button variant="ghost" onClick={() => setPlannerOpen(false)}>
              关闭
            </Button>
          }
        >
          <Field label="描述你的学习目标">
            <Textarea
              value={plannerInput}
              onChange={(e) => setPlannerInput(e.target.value)}
              placeholder="例如：我想系统学习机器学习，零基础，每周可投入 10 小时"
              style={{ minHeight: 80 }}
            />
          </Field>
          <Button onClick={askPlanner} disabled={plannerBusy || !plannerInput.trim()}>
            {plannerBusy ? "规划中…" : "生成计划草案"}
          </Button>
          {plannerErr ? <Banner kind="error">{plannerErr}</Banner> : null}
          {plannerDraft ? (
            <div className="item" style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>
              {plannerDraft}
            </div>
          ) : null}
        </Modal>
      )}
    </div>
  );
}
