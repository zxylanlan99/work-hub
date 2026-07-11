// UI 原子组件 / 布局烟雾测试：仅验证可挂载、不崩溃（最小化，避免 flaky）。
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Layout } from "../components/Layout";
import { Card, CardBody, Button } from "../components/ui";

describe("UI 原子组件 / 布局烟雾测试", () => {
  it("Layout 在 MemoryRouter 下可挂载，Card/Button 正常渲染", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/"]}>
        <Layout>
          <Card>
            <CardBody>
              <Button>点我</Button>
            </CardBody>
          </Card>
        </Layout>
      </MemoryRouter>
    );

    // 布局壳挂载
    expect(container.querySelector(".app-shell")).not.toBeNull();
    expect(container.querySelector(".sidebar")).not.toBeNull();

    // 原子组件挂载
    expect(container.querySelector(".card")).not.toBeNull();
    expect(screen.getByRole("button", { name: "点我" })).toBeInTheDocument();
  });
});
