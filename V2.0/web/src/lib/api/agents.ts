// 智能体中心（agent-service /api/agents, /api/agents/{id}/chat）
import { request } from "../api";
import type { Agent, ChatResponse, ConversationHistory, CustomAgentInput } from "../../types";

export const agentsApi = {
  list: () => request<Agent[]>("agent", "/api/agents"),
  /** 与某个智能体对话；conversation_id 为空时由后端新建。 */
  chat: (
    agentId: string,
    body: { conversation_id?: string; message: string }
  ) =>
    request<ChatResponse>("agent", `/api/agents/${agentId}/chat`, {
      method: "POST",
      body,
    }),
  /** 拉取某次会话历史。 */
  conversation: (conversationId: string) =>
    request<ConversationHistory>("agent", `/api/conversations/${conversationId}`),
  /** 创建自定义智能体（POST /api/agent，T04 V2-AGENT-002）；返回新 id（整数）。 */
  createCustom: (body: CustomAgentInput) =>
    request<{ id: number }>("agent", "/api/agent", { method: "POST", body }),
  /** 删除自定义智能体（DELETE /api/agent/{id}，级联清记忆，T04）。 */
  removeCustom: (id: number) =>
    request<{ id: number }>("agent", `/api/agent/${id}`, { method: "DELETE" }),
};
