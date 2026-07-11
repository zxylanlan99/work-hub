// 智能体中心（T14，V2-AGENT-001/002/003/004/005）
// 内置 + 自定义智能体列表 + 对话控制台（记忆按 conversation_id 隔离，引用来自检索）
// + 自定义智能体创建/编辑/删除（agent-service /api/agent，级联清记忆）
// + Skill 库（系统/自定义，agent-service /api/skill + data-service /api/db/agent_skills）
// + 智能体市场 JSON 导入/导出（T16 V2-AGENT-005）。
import React, { useState } from "react";
import { agentsApi } from "../lib/api/agents";
import { dbApi } from "../lib/api/db";
import { useAsyncData } from "../lib/async";
import {
  Card,
  CardHead,
  CardBody,
  Button,
  Banner,
  Badge,
  Spinner,
  Empty,
  Modal,
} from "../components/ui";
import type {
  Agent,
  ChatMessage,
  CustomAgent,
  AgentSkill,
  CustomAgentInput,
} from "../types";
import SkillManager from "../features/agent/SkillManager";
import CustomAgentForm from "../features/agent/CustomAgentForm";
import AgentMarketplace from "../features/agent/AgentMarketplace";

export default function AgentsPage() {
  const agentsState = useAsyncData<Agent[]>(() => agentsApi.list(), []);
  const customState = useAsyncData<CustomAgent[]>(() => dbApi.listAgents(), []);
  const skillsState = useAsyncData<AgentSkill[]>(() => dbApi.listSkills(), []);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [convId, setConvId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CustomAgent | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const [opErr, setOpErr] = useState<string | null>(null);

  const builtin = agentsState.data ?? [];
  const custom = customState.data ?? [];
  const skills = skillsState.data ?? [];

  const active =
    builtin.find((a) => a.id === activeId) ??
    custom.find((a) => String(a.id) === activeId) ??
    null;

  // 内置智能体有 description，自定义智能体用 prompt 作为对话引导语
  const activeSubtitle = active
    ? "description" in active
      ? active.description
      : active.prompt
    : "";

  function reloadAll() {
    agentsState.reload();
    customState.reload();
    skillsState.reload();
  }

  function selectAgent(id: string) {
    setActiveId(id);
    setChat([]);
    setConvId(null);
  }

  async function send() {
    const text = input.trim();
    if (!text || !activeId || busy) return;
    const next = [...chat, { role: "user" as const, content: text }];
    setChat(next);
    setInput("");
    setBusy(true);
    try {
      const res = await agentsApi.chat(activeId, {
        conversation_id: convId ?? undefined,
        message: text,
      });
      setConvId(res.conversation_id);
      setChat([
        ...next,
        { role: "agent" as const, content: res.reply, citations: res.citations },
      ]);
    } catch (e) {
      setChat([
        ...next,
        {
          role: "agent" as const,
          content: `（调用失败：${e instanceof Error ? e.message : String(e)}）`,
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  async function removeCustom(c: CustomAgent) {
    if (
      !window.confirm(
        `确定删除自定义智能体「${c.name}」？该操作将级联清除其全部对话记忆。`
      )
    )
      return;
    setOpErr(null);
    try {
      await agentsApi.removeCustom(c.id);
      reloadAll();
    } catch (e) {
      setOpErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function submitAgent(input: CustomAgentInput) {
    setEditBusy(true);
    setOpErr(null);
    try {
      // 后端 T04 无 update 端点：编辑以「删后重建」实现（保留原 skill 绑定与名称）。
      if (editing) await agentsApi.removeCustom(editing.id);
      await agentsApi.createCustom(input);
      setFormOpen(false);
      setEditing(null);
      reloadAll();
    } catch (e) {
      setOpErr(e instanceof Error ? e.message : String(e));
    } finally {
      setEditBusy(false);
    }
  }

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }
  function openEdit(c: CustomAgent) {
    setEditing(c);
    setFormOpen(true);
  }

  const total = builtin.length + custom.length;

  return (
    <div>
      <div className="page-head">
        <h1>智能体中心</h1>
        <p>内置 + 自定义智能体 · 对话记忆按 conversation_id 隔离 · 回答带可溯源引用</p>
      </div>

      {opErr ? <Banner kind="error">{opErr}</Banner> : null}

      <div className="grid grid-2">
        {/* 智能体列表（内置 + 自定义，可点选对话） */}
        <Card>
          <CardHead title="智能体" extra={<Badge>{total}</Badge>} />
          <CardBody>
            {agentsState.loading || customState.loading ? (
              <Spinner center />
            ) : agentsState.error || customState.error ? (
              <Banner kind="error">
                加载失败：{agentsState.error ?? customState.error}
                （请确认 agent-service :8001 与 data-service :8000 已启动）
              </Banner>
            ) : total === 0 ? (
              <Empty title="暂无智能体" />
            ) : (
              <div className="list">
                {builtin.map((a) => (
                  <div
                    key={a.id}
                    className="item"
                    style={{
                      cursor: "pointer",
                      borderColor: activeId === a.id ? "var(--bamboo)" : undefined,
                    }}
                    onClick={() => selectAgent(a.id)}
                  >
                    <div className="row-between">
                      <span className="item-title">{a.name}</span>
                      <Badge tone="bamboo">内置</Badge>
                    </div>
                    <div className="item-meta">{a.description}</div>
                  </div>
                ))}
                {custom.map((c) => (
                  <div
                    key={String(c.id)}
                    className="item"
                    style={{
                      cursor: "pointer",
                      borderColor: activeId === String(c.id) ? "var(--bamboo)" : undefined,
                    }}
                    onClick={() => selectAgent(String(c.id))}
                  >
                    <div className="row-between">
                      <span className="item-title">{c.name}</span>
                      <Badge tone="amber">自定义</Badge>
                    </div>
                    <div className="item-meta">
                      {c.prompt ? c.prompt.slice(0, 60) : "（无提示词）"}
                      {c.model ? <span>模型：{c.model}</span> : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        {/* 对话控制台 */}
        <Card>
          <CardHead title={active ? `与「${active.name}」对话` : "对话控制台"} />
          <CardBody>
            {!active ? (
              <Empty title="选择一个智能体开始对话" />
            ) : (
              <>
                <div className="chat">
                  {chat.length === 0 ? (
                    <div className="muted">{activeSubtitle || "开始提问吧。"}</div>
                  ) : (
                    chat.map((m, i) => (
                      <div
                        key={i}
                        className={m.role === "user" ? "bubble bubble-user" : "bubble bubble-agent"}
                      >
                        {m.content}
                        {m.citations?.map((c, ci) => (
                          <span key={ci} className="cite">
                            引用：{c.title}
                            {c.snippet ? ` — ${c.snippet}` : ""}
                          </span>
                        ))}
                      </div>
                    ))
                  )}
                  {busy ? <Spinner /> : null}
                </div>
                <div className="row" style={{ marginTop: 12 }}>
                  <input
                    className="input"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && send()}
                    placeholder="输入消息…"
                  />
                  <Button onClick={send} disabled={busy}>
                    发送
                  </Button>
                </div>
              </>
            )}
          </CardBody>
        </Card>
      </div>

      {/* 自定义智能体管理 */}
      <Card>
        <CardHead
          title="自定义智能体"
          extra={
            <Button size="sm" onClick={openCreate}>
              + 新建智能体
            </Button>
          }
        />
        <CardBody>
          {customState.loading ? (
            <Spinner center />
          ) : custom.length === 0 ? (
            <Empty title="暂无自定义智能体" hint="点击「新建智能体」。" />
          ) : (
            <div className="list">
              {custom.map((c) => (
                <div key={String(c.id)} className="item">
                  <div className="row-between">
                    <span className="item-title">{c.name}</span>
                    <div className="row">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(c)}>
                        编辑
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => removeCustom(c)}>
                        删除
                      </Button>
                    </div>
                  </div>
                  <div className="item-meta">
                    <span>{c.prompt ? c.prompt.slice(0, 60) : "（无提示词）"}</span>
                    {c.skill_ids.length > 0 ? (
                      <span>已绑定 {c.skill_ids.length} 个 Skill</span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Skill 库 */}
      <Card>
        <CardHead title="Skill 库（系统 / 自定义）" />
        <CardBody>
          {skillsState.loading ? (
            <Spinner center />
          ) : skillsState.error ? (
            <Banner kind="error">加载失败：{skillsState.error}</Banner>
          ) : (
            <SkillManager skills={skills} onChanged={reloadAll} />
          )}
        </CardBody>
      </Card>

      {/* 智能体市场 */}
      <Card>
        <CardHead title="智能体市场（JSON 导入 / 导出）" />
        <CardBody>
          <AgentMarketplace onChanged={reloadAll} />
        </CardBody>
      </Card>

      {/* 自定义智能体创建 / 编辑 */}
      {formOpen ? (
        <Modal
          title={editing ? "编辑自定义智能体" : "新建自定义智能体"}
          onClose={() => { setFormOpen(false); setEditing(null); }}
          footer={
            <Button
              variant="ghost"
              onClick={() => { setFormOpen(false); setEditing(null); }}
            >
              关闭
            </Button>
          }
        >
          <CustomAgentForm
            skills={skills}
            initial={editing}
            onSubmit={submitAgent}
            onClose={() => { setFormOpen(false); setEditing(null); }}
          />
          {editBusy ? <Spinner /> : null}
        </Modal>
      ) : null}
    </div>
  );
}
