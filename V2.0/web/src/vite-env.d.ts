/// <reference types="vite/client" />

// StudyMind V2.0 — typed access to the four service base URLs.
// Defaults (authoritative, from team-lead handoff):
//   data-service  :8000   agent-service :8001
//   kb-service    :8002   crawler-service :8003
interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  readonly VITE_DATA_API?: string;
  readonly VITE_AGENT_API?: string;
  readonly VITE_KB_API?: string;
  readonly VITE_CRAWLER_API?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
