// useAsyncData 状态机回归测试：loading → data / loading → error。
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAsyncData } from "./async";

// 用 macrotask 兜底刷新所有微任务（promise 链 + React 状态更新）。
async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
}

describe("useAsyncData 状态机", () => {
  it("初始 loading=true，成功后 data 就绪且 loading=false / error=null", async () => {
    const fn = vi.fn().mockResolvedValue({ id: 1, name: "测试" });
    const { result } = renderHook(() => useAsyncData(fn));

    // 首帧：加载中
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();

    await flush();

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toEqual({ id: 1, name: "测试" });
    expect(result.current.error).toBeNull();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("失败后 error 被设置，且 data=null / loading=false", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useAsyncData(fn));

    expect(result.current.loading).toBe(true);

    await flush();

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe("boom");
  });

  it("reload 触发重新拉取（fn 被再次调用）", async () => {
    const fn = vi.fn().mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useAsyncData(fn));

    await flush();
    expect(fn).toHaveBeenCalledTimes(1);

    await act(async () => {
      result.current.reload();
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(fn).toHaveBeenCalledTimes(2);
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toEqual({ ok: true });
  });
});
