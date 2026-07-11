// 知识库（T12，保留清单 #1 分类 / #2 知识条目 / #12 入库链路）
// 分类树 + 知识条目列表/新建 + 「上传到知识库」（kb-service 入库，回写 backend_collection_id）。
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { categoriesApi } from "../lib/api/categories";
import { knowledgeApi } from "../lib/api/knowledge";
import { kbApi } from "../lib/api/kb";
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
  Modal,
  Banner,
  Badge,
  Spinner,
  Empty,
} from "../components/ui";
import type { Category, KnowledgeItem } from "../types";
import { createReviewCardsFromKnowledge } from "../features/knowledge/knowledgeToReview";
import { setOutputSeed } from "../features/knowledge/outputBridge";
import { splitIntoChunks, type Chunk } from "../features/knowledge/chunking";

function CategoryNode({
  node,
  level,
  onEdit,
  onDelete,
  selected,
  onSelect,
}: {
  node: Category;
  level: number;
  onEdit: (c: Category) => void;
  onDelete: (c: Category) => void;
  selected: number | null;
  onSelect: (id: number | null) => void;
}) {
  const hasChildren = (node.children ?? []).length > 0;
  return (
    <li>
      <div
        className="tree-row"
        style={{ paddingLeft: level * 14, cursor: "pointer" }}
        onClick={() => onSelect(node.id)}
      >
        <span
          className="badge"
          style={
            selected === node.id
              ? { background: "var(--bamboo)", color: "#fff", borderColor: "transparent" }
              : undefined
          }
        >
          {node.name}
        </span>
        <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); onEdit(node); }}>
          改
        </Button>
        <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); onDelete(node); }}>
          删
        </Button>
      </div>
      {hasChildren ? (
        <ul className="tree">
          {(node.children ?? []).map((c) => (
            <CategoryNode
              key={c.id}
              node={c}
              level={level + 1}
              onEdit={onEdit}
              onDelete={onDelete}
              selected={selected}
              onSelect={onSelect}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export default function KnowledgePage() {
  const catsState = useAsyncData<Category[]>(() => categoriesApi.list(), []);
  const itemsState = useAsyncData<KnowledgeItem[]>(() => knowledgeApi.list(), []);

  const [selectedCat, setSelectedCat] = useState<number | null>(null);
  const [showItem, setShowItem] = useState(false);
  const [itemForm, setItemForm] = useState({
    title: "",
    content: "",
    summary: "",
    category_id: "",
    source_type: "note",
  });
  const [saving, setSaving] = useState(false);
  const [uploadingId, setUploadingId] = useState<number | null>(null);

  const [catEdit, setCatEdit] = useState<Category | null>(null);
  const [catName, setCatName] = useState("");
  const [catModal, setCatModal] = useState(false);

  // T16：知识条目 -> 复习卡 / 写作助手 / 分块预览
  const [cardMsg, setCardMsg] = useState<string | null>(null);
  const [genCardId, setGenCardId] = useState<number | null>(null);
  const [chunkItem, setChunkItem] = useState<KnowledgeItem | null>(null);
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [reIngestId, setReIngestId] = useState<number | null>(null);
  const navigate = useNavigate();

  const items = (itemsState.data ?? []).filter(
    (it) => selectedCat === null || it.category_id === selectedCat
  );

  async function saveItem() {
    if (!itemForm.title.trim()) return;
    setSaving(true);
    try {
      await knowledgeApi.create({
        title: itemForm.title.trim(),
        content: itemForm.content,
        summary: itemForm.summary,
        category_id: itemForm.category_id ? Number(itemForm.category_id) : null,
        source_type: itemForm.source_type,
      });
      setShowItem(false);
      setItemForm({ title: "", content: "", summary: "", category_id: "", source_type: "note" });
      itemsState.reload();
    } finally {
      setSaving(false);
    }
  }

  async function uploadToKb(item: KnowledgeItem) {
    setUploadingId(item.id);
    try {
      const ds = await kbApi.createDataset(item.title || "studymind");
      const collectionId = ds.backend_collection_id;
      await kbApi.uploadDocument(collectionId, item.title, item.content);
      await knowledgeApi.update(item.id, { backend_collection_id: collectionId });
      itemsState.reload();
    } finally {
      setUploadingId(null);
    }
  }

  async function saveCategory() {
    if (!catName.trim()) return;
    if (catEdit) {
      await categoriesApi.update(catEdit.id, { name: catName.trim() });
    } else {
      await categoriesApi.create({ name: catName.trim() });
    }
    setCatModal(false);
    setCatEdit(null);
    setCatName("");
    catsState.reload();
  }

  async function deleteCategory(c: Category) {
    await categoriesApi.remove(c.id);
    if (selectedCat === c.id) setSelectedCat(null);
    catsState.reload();
  }

  async function deleteItem(id: number) {
    await knowledgeApi.remove(id);
    itemsState.reload();
  }

  // T16 V2-REVIEW-004：一键生成复习卡（关联 knowledgeId，落库 review_cards）
  async function generateCardsFor(item: KnowledgeItem) {
    setGenCardId(item.id);
    setCardMsg(null);
    try {
      const ids = await createReviewCardsFromKnowledge(item);
      setCardMsg(`已为「${item.title}」生成 ${ids.length} 张复习卡（已关联该知识条目）。`);
    } catch (e) {
      setCardMsg(`生成失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setGenCardId(null);
    }
  }

  // T16 V2-OUTPUT-003：知识条目 -> 写作助手（续写），经 sessionStorage 种子联动
  function sendToWriter(item: KnowledgeItem) {
    setOutputSeed({ title: item.title, content: item.content, sourceKnowledgeId: item.id });
    navigate("/sedimentation");
  }

  // T16 V2-KB-003：分块预览
  function openChunk(item: KnowledgeItem) {
    setChunkItem(item);
    setChunks(splitIntoChunks(item.content));
  }

  function updateChunk(index: number, text: string) {
    setChunks((prev) => prev.map((c, i) => (i === index ? { ...c, text } : c)));
  }

  // T16 V2-KB-003：手动调整后重新入库（合并分块 -> kb-service）
  async function reIngestChunks(item: KnowledgeItem) {
    setReIngestId(item.id);
    try {
      const text = chunks.map((c) => c.text).join("\n\n");
      let collectionId = item.backend_collection_id;
      if (!collectionId) {
        const ds = await kbApi.createDataset(item.title || "studymind");
        collectionId = ds.backend_collection_id;
      }
      await kbApi.uploadDocument(collectionId, item.title, text);
      if (collectionId !== item.backend_collection_id) {
        await knowledgeApi.update(item.id, { backend_collection_id: collectionId });
      }
      itemsState.reload();
      setChunkItem(null);
      setChunks([]);
    } finally {
      setReIngestId(null);
    }
  }

  return (
    <div>
      <div className="page-head">
        <h1>知识库</h1>
        <p>分类管理 · 知识条目 · 上传到知识库（FastGPT 检索后端，C3）</p>
      </div>

      {cardMsg ? (
        <Banner kind={cardMsg.startsWith("生成失败") ? "error" : "info"}>{cardMsg}</Banner>
      ) : null}

      <div className="grid grid-2">
        {/* 分类树 */}
        <Card>
          <CardHead
            title="分类"
            extra={
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setCatEdit(null);
                  setCatName("");
                  setCatModal(true);
                }}
              >
                + 新建分类
              </Button>
            }
          />
          <CardBody>
            {catsState.loading ? (
              <Spinner center />
            ) : catsState.error ? (
              <Banner kind="error">加载失败：{catsState.error}</Banner>
            ) : (catsState.data ?? []).length === 0 ? (
              <Empty title="暂无分类" hint="点击「新建分类」。" />
            ) : (
              <ul className="tree">
                {(catsState.data ?? []).map((c) => (
                  <CategoryNode
                    key={c.id}
                    node={c}
                    level={0}
                    onEdit={(node) => {
                      setCatEdit(node);
                      setCatName(node.name);
                      setCatModal(true);
                    }}
                    onDelete={deleteCategory}
                    selected={selectedCat}
                    onSelect={(id) => setSelectedCat((prev) => (prev === id ? null : id))}
                  />
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        {/* 知识条目 */}
        <Card>
          <CardHead
            title="知识条目"
            extra={
              <Button size="sm" onClick={() => setShowItem(true)}>
                + 新建条目
              </Button>
            }
          />
          <CardBody>
            <div className="row" style={{ marginBottom: 12 }}>
              <Badge tone={selectedCat === null ? "bamboo" : "default"}>
                {selectedCat === null ? "全部分类" : `分类 #${selectedCat}`}
              </Badge>
              {selectedCat !== null ? (
                <Button size="sm" variant="ghost" onClick={() => setSelectedCat(null)}>
                  清除筛选
                </Button>
              ) : null}
            </div>
            {itemsState.loading ? (
              <Spinner center />
            ) : itemsState.error ? (
              <Banner kind="error">加载失败：{itemsState.error}</Banner>
            ) : items.length === 0 ? (
              <Empty title="暂无条目" hint="点击「新建条目」。" />
            ) : (
              <div className="list">
                {items.map((it) => (
                  <div key={it.id} className="item">
                    <div className="row-between">
                      <span className="item-title">{it.title}</span>
                      {it.backend_collection_id ? (
                        <Badge tone="bamboo">已入库</Badge>
                      ) : (
                        <Badge>未入库</Badge>
                      )}
                    </div>
                    <div className="item-meta">
                      <span>{it.source_type}</span>
                      {it.summary ? <span>{it.summary.slice(0, 40)}</span> : null}
                    </div>
                    <div className="item-actions">
                      {!it.backend_collection_id ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={uploadingId === it.id}
                          onClick={() => uploadToKb(it)}
                        >
                          {uploadingId === it.id ? "入库中…" : "上传到知识库"}
                        </Button>
                      ) : null}
                      <Button size="sm" variant="ghost" disabled={genCardId === it.id} onClick={() => generateCardsFor(it)}>
                        {genCardId === it.id ? "生成中…" : "生成复习卡"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => sendToWriter(it)}>
                        送入写作助手
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => openChunk(it)}>
                        分块预览
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => deleteItem(it.id)}>
                        删除
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {/* 新建条目 */}
      {showItem && (
        <Modal
          title="新建知识条目"
          onClose={() => setShowItem(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setShowItem(false)}>
                取消
              </Button>
              <Button onClick={saveItem} disabled={saving || !itemForm.title.trim()}>
                {saving ? "保存中…" : "保存"}
              </Button>
            </>
          }
        >
          <Field label="标题">
            <Input
              value={itemForm.title}
              onChange={(e) => setItemForm({ ...itemForm, title: e.target.value })}
            />
          </Field>
          <Field label="分类">
            <Select
              value={itemForm.category_id}
              onChange={(e) => setItemForm({ ...itemForm, category_id: e.target.value })}
            >
              <option value="">未分类</option>
              {(catsState.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="摘要">
            <Input
              value={itemForm.summary}
              onChange={(e) => setItemForm({ ...itemForm, summary: e.target.value })}
            />
          </Field>
          <Field label="内容">
            <Textarea
              value={itemForm.content}
              onChange={(e) => setItemForm({ ...itemForm, content: e.target.value })}
              style={{ minHeight: 120 }}
            />
          </Field>
        </Modal>
      )}

      {/* 分类编辑 */}
      {catModal ? (
        <Modal
          title={catEdit ? "编辑分类" : "新建分类"}
          onClose={() => {
            setCatModal(false);
            setCatEdit(null);
            setCatName("");
          }}
          footer={
            <>
              <Button
                variant="ghost"
                onClick={() => {
                  setCatModal(false);
                  setCatEdit(null);
                  setCatName("");
                }}
              >
                取消
              </Button>
              <Button onClick={saveCategory} disabled={!catName.trim()}>
                保存
              </Button>
            </>
          }
        >
          <Field label="分类名称">
            <Input value={catName} onChange={(e) => setCatName(e.target.value)} />
          </Field>
        </Modal>
      ) : null}

      {/* 分块预览（T16 V2-KB-003，参考 FastGPT 的分块管理） */}
      {chunkItem ? (
        <Modal
          title={`分块预览：${chunkItem.title}`}
          onClose={() => { setChunkItem(null); setChunks([]); }}
          footer={
            <>
              <Button
                variant="ghost"
                onClick={() => { setChunkItem(null); setChunks([]); }}
              >
                关闭
              </Button>
              <Button onClick={() => reIngestChunks(chunkItem)} disabled={reIngestId === chunkItem.id}>
                {reIngestId === chunkItem.id ? "入库中…" : "重新入库（合并当前分块）"}
              </Button>
            </>
          }
        >
          <div className="muted" style={{ marginBottom: 8 }}>
            共 {chunks.length} 个分块（本地预览，可手动编辑后重新入库；绿阶表示长度）。
          </div>
          <div className="list">
            {chunks.map((c, i) => (
              <div key={i} className="item">
                <div className="row-between">
                  <span className="item-title">#{i + 1}</span>
                  <Badge tone={c.text.length > 500 ? "amber" : "default"}>{c.text.length} 字</Badge>
                </div>
                <Textarea
                  value={c.text}
                  onChange={(e) => updateChunk(i, e.target.value)}
                  style={{ minHeight: 72, marginTop: 6 }}
                />
              </div>
            ))}
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
