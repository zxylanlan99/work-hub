// 智能体中心（T14，V2-AGENT-001/004）
// 内置 + 自定义智能体列表 + 对话控制台（引用 chip 展示）。
import React, { useState } from "react";
import { agentsApi } from "../lib/api/agents";
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
} from "../components/ui";
import type { Agent, ChatMessage } from "../types";

export default function AgentsPage() {
  const agentsState = useAsyncData<Agent[]>(() => agentsApi.list(), []);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [convId, setConvId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  const agents = agentsState.data ?? [];
  const active = agents.find((a) => a.id === activeId) ?? null;

  function selectAgent(a: Agent) {
    setActiveId(a.id);
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
        { role: "agent" as const, content: `（调用失败：${e instanceof Error ? e.message : String(e)}）` },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="page-head">
        <h1>智能体中心</h1>
        <p>内置智能体 + 自定义智能体 · 对话记忆按 agent_id 隔离 · 回答带可溯源引用</p>
      </div>

      <div className="grid grid-2">
        {/* 列表 */}
        <Card>
          <CardHead title="智能体" extra={<Badge>{agents.length}</Badge>} />
          <CardBody>
            {agentsState.loading ? (
              <Spinner center />
            ) : agentsState.error ? (
              <Banner kind="error">加载失败：{agentsState.error}（请确认 agent-service :8001 已启动）</Banner>
            ) : agents.length === 0 ? (
              <Empty title="暂无智能体" />
            ) : (
              <div className="list">
                {agents.map((a) => (
                  <div
                    key={a.id}
                    className="item"
                    style={{
                      cursor: "pointer",
                      borderColor: activeId === a.id ? "var(--bamboo)" : undefined,
                    }}
                    onClick={() => selectAgent(a)}
                  >
                    <div className="row-between">
                      <span className="item-title">{a.name}</span>
                      {a.builtin ? <Badge tone="bamboo">内置</Badge> : <Badge tone="amber">自定义</Badge>}
                    </div>
                    <div className="item-meta">{a.description}</div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        {/* 对话 */}
        <Card>
          <CardHead title={active ? `与「${active.name}」对话` : "对话控制台"} />
          <CardBody>
            {!active ? (
              <Empty title="选择一个智能体开始对话" />
            ) : (
              <>
                <div className="chat">
                  {chat.length === 0 ? (
                    <div className="muted">{active.description || "开始提问吧。"}</div>
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
    </div>
  );
}
