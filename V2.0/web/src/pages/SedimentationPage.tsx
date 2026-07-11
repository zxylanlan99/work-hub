// 知识沉淀（T15，V2-OUTPUT-001/002）— 单一 TipTap 写作面（取消对比模式）
// 大纲→成稿 / 草稿润色：调用 general 智能体（/api/agents/general/chat），结果回填。
// 仅本页可使用 TipTap（@tiptap/react + @tiptap/starter-kit）。
import React, { useEffect, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { agentsApi } from "../lib/api/agents";
import { categoriesApi } from "../lib/api/categories";
import { knowledgeApi } from "../lib/api/knowledge";
import { useAsyncData } from "../lib/async";
import {
  Card,
  CardHead,
  CardBody,
  Button,
  Field,
  Input,
  Banner,
  Spinner,
  Select,
  Modal,
} from "../components/ui";
import { getOutputSeed, clearOutputSeed } from "../features/knowledge/outputBridge";
import type { Category } from "../types";

const DRAFT_KEY = "studymind.sedimentation.draft";

export default function SedimentationPage() {
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState<"" | "polish" | "summary">("");
  const [note, setNote] = useState<string | null>(null);

  // T16 V2-OUTPUT-003：成稿 -> 知识库
  const [saveOpen, setSaveOpen] = useState(false);
  const [catId, setCatId] = useState<string>("");
  const [savingKb, setSavingKb] = useState(false);
  const [seedMsg, setSeedMsg] = useState<string | null>(null);
  const catState = useAsyncData<Category[]>(() => categoriesApi.list(), []);

  const editor = useEditor({
    extensions: [StarterKit],
    content: "<p></p>",
  });

  // 恢复本地草稿（用户自身内容，非 mock 数据）。
  useEffect(() => {
    try {
      // 优先：来自知识库的续写种子（知识条目 -> 写作助手）
      const seed = getOutputSeed();
      if (seed && editor) {
        if (seed.title) setTitle(seed.title);
        const html = `<p>${(seed.content || "").replace(/\n{1,2}/g, "</p><p>")}</p>`;
        editor.commands.setContent(html);
        clearOutputSeed();
        return;
      }
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { title: string; html: string };
        if (parsed.title) setTitle(parsed.title);
        if (parsed.html && editor) editor.commands.setContent(parsed.html);
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function saveDraft() {
    if (!editor) return;
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ title, html: editor.getHTML(), ts: Date.now() })
    );
    setNote("草稿已保存到本地（浏览器）。");
  }

  function exportFile(kind: "md" | "html") {
    if (!editor) return;
    const text = editor.getText();
    const blob =
      kind === "md"
        ? new Blob([`# ${title || "未命名"}\n\n${text}`], { type: "text/markdown" })
        : new Blob([`<h1>${title || "未命名"}</h1>${editor.getHTML()}`], {
            type: "text/html",
          });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title || "studymind"}-成稿.${kind}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function runAgent(mode: "polish" | "summary") {
    if (!editor) return;
    const text = editor.getText().trim();
    if (!text) {
      setNote("请先写一些内容，再使用润色/总结。");
      return;
    }
    setBusy(mode);
    setNote(null);
    const prompt =
      mode === "polish"
        ? `请润色并完善以下文章，保持原意、提升表达流畅度与结构：\n\n${text}`
        : `请为以下内容生成结构化大纲与要点总结：\n\n${text}`;
    try {
      const res = await agentsApi.chat("general", { message: prompt });
      const html = `<p>${res.reply.replace(/\n{1,2}/g, "</p><p>")}</p>`;
      editor.commands.setContent(html);
      setNote(mode === "polish" ? "润色完成，已回填编辑器。" : "总结完成，已回填编辑器。");
    } catch (e) {
      setNote(`调用失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy("");
    }
  }

  // T16 V2-OUTPUT-003：成稿 -> 知识库分类
  async function saveToKb() {
    if (!editor) return;
    const text = editor.getText().trim();
    if (!title.trim() && !text) {
      setSeedMsg("请先填写标题或正文。");
      return;
    }
    setSavingKb(true);
    setSeedMsg(null);
    try {
      await knowledgeApi.create({
        title: title.trim() || "未命名成稿",
        content: text,
        summary: title.trim(),
        category_id: catId ? Number(catId) : null,
        source_type: "writing",
      });
      setSaveOpen(false);
      setSeedMsg("已存入知识库。");
    } catch (e) {
      setSeedMsg(`存入失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSavingKb(false);
    }
  }

  return (
    <div>
      <div className="page-head">
        <h1>知识沉淀</h1>
        <p>单一写作面（无对比模式）· 大纲成稿 / 润色完善 · 调用 general 智能体</p>
      </div>

      {seedMsg ? (
        <Banner kind={seedMsg.startsWith("存入失败") || seedMsg.startsWith("请先") ? "error" : "info"}>
          {seedMsg}
        </Banner>
      ) : null}

      <Card>
        <CardHead
          title="写作面"
          extra={
            <div className="row">
              <Button size="sm" variant="secondary" onClick={saveDraft}>
                保存草稿
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setSaveOpen(true)}>
                存入知识库
              </Button>
              <Button size="sm" variant="ghost" onClick={() => exportFile("md")}>
                导出 .md
              </Button>
              <Button size="sm" variant="ghost" onClick={() => exportFile("html")}>
                导出 .html
              </Button>
            </div>
          }
        />
        <CardBody>
          <Field label="标题">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="成稿标题" />
          </Field>

          {/* 工具栏 */}
          <div className="tiptap-wrap">
            <div className="tiptap-toolbar">
              <Button size="sm" variant="ghost" onClick={() => editor?.chain().focus().toggleBold().run()}>
                B
              </Button>
              <Button size="sm" variant="ghost" onClick={() => editor?.chain().focus().toggleItalic().run()}>
                I
              </Button>
              <Button size="sm" variant="ghost" onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run() }>
                H1
              </Button>
              <Button size="sm" variant="ghost" onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run() }>
                H2
              </Button>
              <Button size="sm" variant="ghost" onClick={() => editor?.chain().focus().toggleBulletList().run() }>
                • 列表
              </Button>
              <Button size="sm" variant="ghost" onClick={() => editor?.chain().focus().toggleOrderedList().run() }>
                1. 列表
              </Button>
              <Button size="sm" variant="ghost" onClick={() => editor?.chain().focus().toggleBlockquote().run() }>
                引用
              </Button>
            </div>
            <EditorContent editor={editor} className="tiptap" />
          </div>

          <div className="divider" />

          <div className="row row-between">
            <div className="row">
              <Button onClick={() => runAgent("polish")} disabled={busy !== ""}>
                {busy === "polish" ? "润色中…" : "润色 / 完善"}
              </Button>
              <Button variant="secondary" onClick={() => runAgent("summary")} disabled={busy !== ""}>
                {busy === "summary" ? "总结中…" : "生成大纲 / 总结"}
              </Button>
            </div>
            {busy !== "" ? <Spinner /> : null}
          </div>

          {note ? <Banner kind="info">{note}</Banner> : null}
          <p className="muted" style={{ marginTop: 12 }}>
            说明：成稿的持久化后端（output_docs）不在本次提供的接口契约内（属 T16 P1），
            本页使用本地草稿 + 导出作为兜底，确保写作不丢失。
          </p>
        </CardBody>
      {/* 存入知识库（T16 V2-OUTPUT-003） */}
      {saveOpen ? (
        <Modal
          title="存入知识库"
          onClose={() => setSaveOpen(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setSaveOpen(false)}>
                取消
              </Button>
              <Button onClick={saveToKb} disabled={savingKb}>
                {savingKb ? "存入中…" : "存入"}
              </Button>
            </>
          }
        >
          <Field label="存入分类">
            <Select value={catId} onChange={(e) => setCatId(e.target.value)}>
              <option value="">未分类</option>
              {(catState.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="muted">
            当前标题与正文将作为一条知识条目写入知识库（source_type=writing）。
          </div>
        </Modal>
      ) : null}

      </Card>
    </div>
  );
}
