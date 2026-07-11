/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// StudyMind V2.0 前端回归测试配置（Wave 3 复验）。
// 与 vite.config.ts 解耦：当 vitest.config.ts 存在时 vitest 以本文件为准，
// 因此显式引入 react 插件以保证 .tsx 解析。
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
