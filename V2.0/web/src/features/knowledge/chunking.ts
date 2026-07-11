// 客户端分块预览（V2-KB-003，知识库可视化分块管理）。
//
// 假设（已注明）：当前 kb-service 未暴露「列出切片(chunks)」端点，因此分块预览由本地
// 按段落/句子切分得到，仅供前端可视化与手动调整；手动调整后通过 kb-service 的
// 真实上传接口（POST /api/kb/documents）重新入库（C1，零 mock）。后续若 kb-service
// 提供 chunk 列表接口，可直接替换此处预览来源，不影响调用方。
export interface Chunk {
  index: number;
  text: string;
}

export function splitIntoChunks(text: string, maxLen = 500, overlap = 50): Chunk[] {
  const clean = (text || "").replace(/\r\n/g, "\n").trim();
  if (!clean) return [];
  const paras = clean.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks: Chunk[] = [];
  let buf = "";

  const flush = () => {
    const t = buf.trim();
    if (t) chunks.push({ index: chunks.length, text: t });
    buf = "";
  };

  for (const para of paras) {
    if (para.length > maxLen) {
      flush();
      const sentences = para.match(/[^。！？\n]+[。！？\n]?/g) ?? [para];
      let seg = "";
      for (const s of sentences) {
        if ((seg + s).length > maxLen && seg) {
          chunks.push({ index: chunks.length, text: seg.trim() });
          seg = overlap > 0 ? seg.slice(-overlap) : "";
        }
        seg += s;
      }
      if (seg.trim()) chunks.push({ index: chunks.length, text: seg.trim() });
    } else {
      if ((buf + "\n\n" + para).length > maxLen && buf) flush();
      buf = buf ? buf + "\n\n" + para : para;
    }
  }
  flush();
  return chunks;
}
