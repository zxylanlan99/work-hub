// Skill 库管理（T04 V2-AGENT-003，前端组件）
// 系统 Skill（builtin）只读展示；自定义 Skill 可创建 / 删除。
// 创建/删除走 agent-service /api/skill（落库 data-service agent_skills），列表走 data-service /api/db/agent_skills。
import React, { useState } from "react";
import { skillsApi } from "../../lib/api/skills";
import {
  Button,
  Field,
  Input,
  Textarea,
  Badge,
  Banner,
  Empty,
  Modal,
} from "../../components/ui";
import type { AgentSkill } from "../../types";

const TOOL_LABELS: Record<string, string> = {
  web_search: "联网搜索",
  knowledge_base: "知识库",
  code_exec: "代码执行",
};

type ToolKey = "web_search" | "knowledge_base" | "code_exec";

export default function SkillManager({
  skills,
  onChanged,
}: {
  skills: AgentSkill[];
  onChanged: () => void;
}) {
  const builtin = skills.filter((s) => s.builtin);
  const custom = skills.filter((s) => !s.builtin);

  const [show, setShow] = useState(false);
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [tools, setTools] = useState<Record<ToolKey, boolean>>({
    web_search: false,
    knowledge_base: false,
    code_exec: false,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function reset() {
    setName("");
    setPrompt("");
    setTools({ web_search: false, knowledge_base: false, code_exec: false });
    setErr(null);
  }

  async function create() {
    if (!name.trim() || busy) return;
    const selected = (Object.keys(tools) as ToolKey[]).filter((t) => tools[t]);
    setBusy(true);
    setErr(null);
    try {
      await skillsApi.create({ name: name.trim(), prompt, tools: selected });
      setShow(false);
      reset();
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number | string) {
    try {
      await skillsApi.remove(Number(id));
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div>
      <div className="row row-between" style={{ marginBottom: 12 }}>
        <div className="muted">
          系统 {builtin.length} · 自定义 {custom.length}
        </div>
        <Button size="sm" onClick={() => { reset(); setShow(true); }}>
          + 新建 Skill
        </Button>
      </div>

      {err ? <Banner kind="error">{err}</Banner> : null}

      <div className="muted" style={{ marginBottom: 6 }}>
        系统 Skill（不可删）
      </div>
      {builtin.length === 0 ? (
        <div className="muted">无</div>
      ) : (
        <div className="list">
          {builtin.map((s) => (
            <div key={String(s.id)} className="item">
              <div className="row-between">
                <span className="item-title">{s.name}</span>
                <Badge tone="bamboo">系统</Badge>
              </div>
              <div className="item-meta">
                <span>{s.prompt || "（无提示词）"}</span>
                {(s.tools ?? []).map((t) => (
                  <Badge key={t}>{TOOL_LABELS[t] ?? t}</Badge>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="muted" style={{ margin: "12px 0 6px" }}>
        自定义 Skill
      </div>
      {custom.length === 0 ? (
        <Empty title="暂无自定义 Skill" hint="点击「新建 Skill」。" />
      ) : (
        <div className="list">
          {custom.map((s) => (
            <div key={String(s.id)} className="item">
              <div className="row-between">
                <span className="item-title">{s.name}</span>
                <Button size="sm" variant="danger" onClick={() => remove(s.id)}>
                  删除
                </Button>
              </div>
              <div className="item-meta">
                <span>{s.prompt || "（无提示词）"}</span>
                {(s.tools ?? []).map((t) => (
                  <Badge key={t}>{TOOL_LABELS[t] ?? t}</Badge>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {show ? (
        <Modal
          title="新建自定义 Skill"
          onClose={() => setShow(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setShow(false)}>
                取消
              </Button>
              <Button onClick={create} disabled={busy || !name.trim()}>
                {busy ? "创建中…" : "创建"}
              </Button>
            </>
          }
        >
          <Field label="名称">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="提示词">
            <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} />
          </Field>
          <Field label="工具（白名单：web_search / knowledge_base / code_exec）">
            <div className="row">
              {(Object.keys(tools) as ToolKey[]).map((t) => (
                <label key={t} className="row" style={{ gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={tools[t]}
                    onChange={(e) => setTools((p) => ({ ...p, [t]: e.target.checked }))}
                  />
                  <span>{TOOL_LABELS[t] ?? t}</span>
                </label>
              ))}
            </div>
          </Field>
          {err ? <Banner kind="error">{err}</Banner> : null}
        </Modal>
      ) : null}
    </div>
  );
}
