// 知识库（T12，保留清单 #1 分类 / #2 知识条目 / #12 入库链路）
// 分类树 + 知识条目列表/新建 + 「上传到知识库」（kb-service 入库，回写 backend_collection_id）。
import React, { useState } from "react";
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

  return (
    <div>
      <div className="page-head">
        <h1>知识库</h1>
        <p>分类管理 · 知识条目 · 上传到知识库（FastGPT 检索后端，C3）</p>
      </div>

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
    </div>
  );
}
