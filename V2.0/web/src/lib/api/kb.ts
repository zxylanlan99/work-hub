// 知识库网关（kb-service /api/kb/*，封装 FastGPT，仅检索后端，C3）
//
// 上传链路：先 POST /api/kb/datasets 建数据集 → 拿到 backend_collection_id，
// 再 POST /api/kb/documents 入库（dataset_id 传 backend_collection_id），
// 最后把 backend_collection_id 回写知识条目（data-service）。
import { request } from "../api";
import type { KbDataset, KbDocument, KbSearchResult } from "../../types";

export const kbApi = {
  createDataset: (name: string) =>
    request<KbDataset>("kb", "/api/kb/datasets", {
      method: "POST",
      body: { name },
    }),
  listDatasets: () => request<KbDataset[]>("kb", "/api/kb/datasets"),
  /** 入库文档；dataset_id 即 createDataset 返回的 backend_collection_id。 */
  uploadDocument: (datasetId: string, title: string, content: string) =>
    request<KbDocument>("kb", "/api/kb/documents", {
      method: "POST",
      body: { dataset_id: datasetId, title, content },
    }),
  search: (datasetId: string, query: string, topK = 5) =>
    request<KbSearchResult[]>("kb", "/api/kb/search", {
      method: "POST",
      body: { dataset_id: datasetId, query, top_k: topK },
    }),
};
