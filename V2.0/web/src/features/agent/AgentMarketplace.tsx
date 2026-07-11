// 智能体市场 JSON 导入 / 导出（T16 V2-AGENT-005，依赖 T04）
// 导出：自定义智能体 + 自定义 Skill 配置为 JSON 文件下载。
// 导入：解析 JSON，先建 Skill（建立 旧id->新id 映射），再建智能体（skillIds 重映射），系统 Skill 透传。
// 全部走真实接口（C1，零 mock）。
import React, { useRef, useState } from "react";
import { dbApi } from "../../lib/api/db";
import { skillsApi } from "../../lib/api/skills";
import { agentsApi } from "../../lib/api/agents";
import { Button, Banner } from "../../components/ui";
import type {
  AgentSkill,
  CustomAgent,
  CustomAgentInput,
} from "../../types";

interface MarketplaceExport {
  version: number;
  exportedAt: string;
  agents: CustomAgent[];
  skills: AgentSkill[];
}

type ToolKey = "web_search" | "knowledge_base" | "code_exec";

export default function AgentMarketplace({ onChanged }: { onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function exportConfig() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const [agents, skills] = await Promise.all([
        dbApi.listAgents(),
        dbApi.listSkills(),
      ]);
      const payload: MarketplaceExport = {
        version: 1,
        exportedAt: new Date().toISOString(),
        agents,
        skills: skills.filter((s) => !s.builtin),
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `studymind-agents-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg(
        `已导出 ${agents.length} 个自定义智能体、${payload.skills.length} 个自定义 Skill。`
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function importConfig(file: File) {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const text = await file.text();
      const data = JSON.parse(text) as Partial<MarketplaceExport>;
      const skills = Array.isArray(data.skills) ? data.skills : [];
      const agents = Array.isArray(data.agents) ? data.agents : [];

      // 1) 先导入自定义 Skill，建立 旧id -> 新id 映射
      const idMap = new Map<string, string>();
      for (const s of skills) {
        const created = await skillsApi.create({
          name: s.name,
          prompt: s.prompt,
          tools: (s.tools ?? []) as ToolKey[],
        });
        idMap.set(String(s.id), String(created.id));
      }

      // 2) 导入自定义智能体，skillIds 中自定义 id 需重映射（系统 id 透传）
      for (const a of agents) {
        const remapped: string[] = (a.skill_ids ?? []).map(
          (sid) => idMap.get(sid) ?? sid
        );
        const input: CustomAgentInput = {
          name: a.name,
          prompt: a.prompt,
          skillIds: remapped,
          knowledgeScope: a.knowledge_scope || undefined,
          model: a.model || undefined,
        };
        await agentsApi.createCustom(input);
      }

      setMsg(`已导入 ${skills.length} 个 Skill、${agents.length} 个自定义智能体。`);
      onChanged();
    } catch (e) {
      setErr(`导入失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="muted" style={{ marginBottom: 10 }}>
        将自定义智能体与 Skill 配置导出为 JSON 备份，或从 JSON 恢复（系统 Skill 不参与导入导出）。
      </div>
      <div className="row">
        <Button size="sm" onClick={exportConfig} disabled={busy}>
          导出配置
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
        >
          {busy ? "处理中…" : "导入配置"}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importConfig(f);
            e.target.value = "";
          }}
        />
      </div>
      {msg ? <Banner kind="info">{msg}</Banner> : null}
      {err ? <Banner kind="error">{err}</Banner> : null}
    </div>
  );
}
