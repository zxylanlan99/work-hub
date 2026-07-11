// 自定义智能体创建 / 编辑表单（T04 V2-AGENT-002，前端组件）
// 绑定 Skill（系统 + 自定义），可选知识库作用域与模型。
// 注：后端 T04 仅提供 创建/删除 端点，无 update；编辑由父组件以「删后重建」实现。
import React, { useState } from "react";
import { Button, Field, Input, Textarea } from "../../components/ui";
import type { AgentSkill, CustomAgent, CustomAgentInput } from "../../types";

export default function CustomAgentForm({
  skills,
  initial,
  onSubmit,
  onClose,
}: {
  skills: AgentSkill[];
  initial?: CustomAgent | null;
  onSubmit: (input: CustomAgentInput) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [prompt, setPrompt] = useState(initial?.prompt ?? "");
  const [scope, setScope] = useState(initial?.knowledge_scope ?? "");
  const [model, setModel] = useState(initial?.model ?? "");
  const [skillIds, setSkillIds] = useState<string[]>(initial?.skill_ids ?? []);

  function toggle(id: number | string) {
    const key = String(id);
    setSkillIds((prev) =>
      prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]
    );
  }

  function submit() {
    if (!name.trim()) return;
    onSubmit({
      name: name.trim(),
      prompt,
      skillIds,
      knowledgeScope: scope.trim() || undefined,
      model: model.trim() || undefined,
    });
  }

  return (
    <div>
      <Field label="名称">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="智能体名称" />
      </Field>
      <Field label="系统提示词">
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="描述该智能体的角色、目标与约束"
          style={{ minHeight: 110 }}
        />
      </Field>
      <Field label="绑定 Skill（可多选）">
        {skills.length === 0 ? (
          <div className="muted">暂无可用 Skill（先到下方「Skill 库」新建）。</div>
        ) : (
          <div className="list" style={{ maxHeight: 200, overflowY: "auto" }}>
            {skills.map((s) => (
              <label
                key={String(s.id)}
                className="row"
                style={{ gap: 8, cursor: "pointer", padding: "4px 0" }}
              >
                <input
                  type="checkbox"
                  checked={skillIds.includes(String(s.id))}
                  onChange={() => toggle(s.id)}
                />
                <span>
                  {s.name}
                  {s.builtin ? "（系统）" : "（自定义）"}
                </span>
              </label>
            ))}
          </div>
        )}
      </Field>
      <div className="grid grid-2">
        <Field label="知识库作用域（可选）">
          <Input value={scope} onChange={(e) => setScope(e.target.value)} placeholder="如：AI 论文" />
        </Field>
        <Field label="模型（可选）">
          <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="如：gpt-4o" />
        </Field>
      </div>

      <div className="modal-foot" style={{ padding: 0, marginTop: 12 }}>
        <Button variant="ghost" onClick={onClose}>
          取消
        </Button>
        <Button onClick={submit} disabled={!name.trim()}>
          保存
        </Button>
      </div>
    </div>
  );
}
