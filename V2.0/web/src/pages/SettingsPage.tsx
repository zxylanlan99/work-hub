// 系统设置（T09，保留清单 #9 模型配置 / #13 RSS 源管理）
// 模型配置 CRUD（/api/settings/models）+ RSS 源管理（/api/rss，可启停）
// + 红线配置只读展示说明（R1-R5，C2 红线在服务端执行）。
import React, { useState } from "react";
import { modelsApi } from "../lib/api/models";
import { rssApi } from "../lib/api/rss";
import { useAsyncData } from "../lib/async";
import {
  Card,
  CardHead,
  CardBody,
  Button,
  Field,
  Input,
  Textarea,
  Toggle,
  Modal,
  Banner,
  Badge,
  Spinner,
  Empty,
} from "../components/ui";
import type { ModelConfig, RssSource } from "../types";

const REDLINE_RULES: Array<{ code: string; rule: string }> = [
  { code: "R1", rule: "无正文：body 为空或正文 < 200 字 → 丢弃，不入库" },
  { code: "R2", rule: "来源不可信：命中来源黑名单 / 域名非白名单 → 不推荐、不入库" },
  { code: "R3", rule: "关键词红线：命中敏感 / 垃圾关键词 → 拦截" },
  { code: "R4", rule: "摘要当正文：仅有 summary 无 body → 视为无正文（R1）" },
  { code: "R5", rule: "去重：同 URL 或标题相似 ≥85% → 跳过" },
];

export default function SettingsPage() {
  const modelsState = useAsyncData<ModelConfig[]>(() => modelsApi.list(), []);
  const rssState = useAsyncData<RssSource[]>(() => rssApi.list(), []);

  const [showModel, setShowModel] = useState(false);
  const [modelForm, setModelForm] = useState({
    id: 0,
    provider: "",
    model_name: "",
    base_url: "",
    api_key: "",
    is_default: false,
    display_name: "",
    plan_type: "",
  });
  const [saving, setSaving] = useState(false);

  const [showRss, setShowRss] = useState(false);
  const [rssForm, setRssForm] = useState({ id: 0, url: "", title: "", category: "", enabled: true });

  async function saveModel() {
    if (!modelForm.provider.trim() || !modelForm.model_name.trim()) return;
    setSaving(true);
    try {
      if (modelForm.id) {
        await modelsApi.update(modelForm.id, {
          provider: modelForm.provider,
          model_name: modelForm.model_name,
          base_url: modelForm.base_url,
          api_key: modelForm.api_key,
          is_default: modelForm.is_default,
          display_name: modelForm.display_name,
          plan_type: modelForm.plan_type,
        });
      } else {
        await modelsApi.create({
          provider: modelForm.provider,
          model_name: modelForm.model_name,
          base_url: modelForm.base_url,
          api_key: modelForm.api_key,
          is_default: modelForm.is_default,
          display_name: modelForm.display_name,
          plan_type: modelForm.plan_type,
        });
      }
      setShowModel(false);
      resetModel();
      modelsState.reload();
    } finally {
      setSaving(false);
    }
  }
  function resetModel() {
    setModelForm({ id: 0, provider: "", model_name: "", base_url: "", api_key: "", is_default: false, display_name: "", plan_type: "" });
  }
  async function removeModel(id: number) {
    await modelsApi.remove(id);
    modelsState.reload();
  }

  async function saveRss() {
    if (!rssForm.url.trim()) return;
    setSaving(true);
    try {
      if (rssForm.id) {
        await rssApi.update(rssForm.id, { url: rssForm.url, title: rssForm.title, category: rssForm.category, enabled: rssForm.enabled });
      } else {
        await rssApi.create({ url: rssForm.url, title: rssForm.title, category: rssForm.category, enabled: rssForm.enabled });
      }
      setShowRss(false);
      setRssForm({ id: 0, url: "", title: "", category: "", enabled: true });
      rssState.reload();
    } finally {
      setSaving(false);
    }
  }
  async function toggleRss(r: RssSource) {
    await rssApi.update(r.id, { enabled: !r.enabled });
    rssState.reload();
  }
  async function removeRss(id: number) {
    await rssApi.remove(id);
    rssState.reload();
  }

  return (
    <div>
      <div className="page-head">
        <h1>系统设置</h1>
        <p>模型配置 + RSS 源管理 + 红线规则（仅两节，遵循 V2-SET-001）</p>
      </div>

      {/* 模型配置 */}
      <Card>
        <CardHead
          title="模型配置"
          extra={
            <Button size="sm" onClick={() => { resetModel(); setShowModel(true); }}>
              + 添加模型
            </Button>
          }
        />
        <CardBody>
          {modelsState.loading ? (
            <Spinner center />
          ) : modelsState.error ? (
            <Banner kind="error">加载失败：{modelsState.error}（请确认 data-service :8000 已启动）</Banner>
          ) : (modelsState.data ?? []).length === 0 ? (
            <Empty title="还没有模型配置" hint="添加国内厂商或 Coding Plan 模型作为默认模型。" />
          ) : (
            <div className="list">
              {(modelsState.data ?? []).map((m) => (
                <div key={m.id} className="item">
                  <div className="row-between">
                    <span className="item-title">
                      {m.display_name || m.model_name}{" "}
                      <span className="muted">（{m.provider}）</span>
                    </span>
                    {m.is_default ? <Badge tone="bamboo">默认</Badge> : null}
                  </div>
                  <div className="item-meta">
                    <span className="code">{m.base_url || "—"}</span>
                    {m.plan_type ? <span>套餐：{m.plan_type}</span> : null}
                    <span>密钥：{m.api_key ? "已配置" : "未配置"}</span>
                  </div>
                  <div className="item-actions">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setModelForm({
                          id: m.id,
                          provider: m.provider,
                          model_name: m.model_name,
                          base_url: m.base_url,
                          api_key: m.api_key,
                          is_default: m.is_default,
                          display_name: m.display_name ?? "",
                          plan_type: m.plan_type ?? "",
                        });
                        setShowModel(true);
                      }}
                    >
                      编辑
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => removeModel(m.id)}>
                      删除
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* RSS 源管理 */}
      <Card>
        <CardHead
          title="RSS 源管理"
          extra={
            <Button size="sm" onClick={() => { setRssForm({ id: 0, url: "", title: "", category: "", enabled: true }); setShowRss(true); }}>
              + 添加源
            </Button>
          }
        />
        <CardBody>
          {rssState.loading ? (
            <Spinner center />
          ) : rssState.error ? (
            <Banner kind="error">加载失败：{rssState.error}</Banner>
          ) : (rssState.data ?? []).length === 0 ? (
            <Empty title="暂无 RSS 源" hint="添加 RSS 源后，爬虫仅抓取已启用的源。" />
          ) : (
            <div className="list">
              {(rssState.data ?? []).map((r) => (
                <div key={r.id} className="item">
                  <div className="row-between">
                    <span className="item-title">{r.title || r.url}</span>
                    <Toggle checked={r.enabled} onChange={() => toggleRss(r)} label="启用" />
                  </div>
                  <div className="item-meta">
                    <span className="code">{r.url}</span>
                    {r.category ? <span>分类：{r.category}</span> : null}
                    {r.enabled ? <Badge tone="bamboo">启用中</Badge> : <Badge>已停用</Badge>}
                  </div>
                  <div className="item-actions">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setRssForm({ id: r.id, url: r.url, title: r.title, category: r.category, enabled: r.enabled });
                        setShowRss(true);
                      }}
                    >
                      编辑
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => removeRss(r.id)}>
                      删除
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* 红线规则（只读） */}
      <Card>
        <CardHead title="红线规则（服务端执行，只读）" />
        <CardBody>
          <p className="muted" style={{ marginTop: 0 }}>
            红线由 crawler-service 服务端统一执行（C2），前端无绕过入口。以下为当前生效规则说明：
          </p>
          <ul className="tree">
            {REDLINE_RULES.map((r) => (
              <li key={r.code} className="tree-row">
                <Badge tone="cinnabar">{r.code}</Badge>
                <span>{r.rule}</span>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      {/* 模型弹窗 */}
      {showModel && (
        <Modal
          title={modelForm.id ? "编辑模型" : "添加模型"}
          onClose={() => setShowModel(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setShowModel(false)}>
                取消
              </Button>
              <Button onClick={saveModel} disabled={saving || !modelForm.provider.trim() || !modelForm.model_name.trim()}>
                {saving ? "保存中…" : "保存"}
              </Button>
            </>
          }
        >
          <Field label="服务商（provider）">
            <Input value={modelForm.provider} onChange={(e) => setModelForm({ ...modelForm, provider: e.target.value })} placeholder="如 deepseek / qwen / openai" />
          </Field>
          <Field label="模型名称">
            <Input value={modelForm.model_name} onChange={(e) => setModelForm({ ...modelForm, model_name: e.target.value })} placeholder="如 deepseek-chat" />
          </Field>
          <Field label="显示名（可选）">
            <Input value={modelForm.display_name} onChange={(e) => setModelForm({ ...modelForm, display_name: e.target.value })} />
          </Field>
          <Field label="Base URL">
            <Input value={modelForm.base_url} onChange={(e) => setModelForm({ ...modelForm, base_url: e.target.value })} placeholder="https://..." />
          </Field>
          <Field label="套餐类型（可选）">
            <Input value={modelForm.plan_type} onChange={(e) => setModelForm({ ...modelForm, plan_type: e.target.value })} placeholder="standard / coding / token" />
          </Field>
          <Field label="API Key">
            <Input type="password" value={modelForm.api_key} onChange={(e) => setModelForm({ ...modelForm, api_key: e.target.value })} placeholder="仅提交到服务端，浏览器不持久化明文" />
          </Field>
          <div className="row">
            <Toggle checked={modelForm.is_default} onChange={(v) => setModelForm({ ...modelForm, is_default: v })} label="设为默认" />
            <span className="muted">设为默认模型</span>
          </div>
        </Modal>
      )}

      {/* RSS 弹窗 */}
      {showRss && (
        <Modal
          title={rssForm.id ? "编辑 RSS 源" : "添加 RSS 源"}
          onClose={() => setShowRss(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setShowRss(false)}>
                取消
              </Button>
              <Button onClick={saveRss} disabled={saving || !rssForm.url.trim()}>
                {saving ? "保存中…" : "保存"}
              </Button>
            </>
          }
        >
          <Field label="RSS URL">
            <Input value={rssForm.url} onChange={(e) => setRssForm({ ...rssForm, url: e.target.value })} placeholder="https://example.com/feed.xml" />
          </Field>
          <Field label="标题（可选）">
            <Input value={rssForm.title} onChange={(e) => setRssForm({ ...rssForm, title: e.target.value })} />
          </Field>
          <Field label="分类（可选）">
            <Input value={rssForm.category} onChange={(e) => setRssForm({ ...rssForm, category: e.target.value })} />
          </Field>
          <div className="row">
            <Toggle checked={rssForm.enabled} onChange={(v) => setRssForm({ ...rssForm, enabled: v })} label="启用" />
            <span className="muted">启用后将参与爬虫抓取</span>
          </div>
        </Modal>
      )}
    </div>
  );
}
