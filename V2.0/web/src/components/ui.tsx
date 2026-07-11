// 墨研设计系统的可复用 UI 原子组件（原生实现，不用组件库）。
import React from "react";

// ----------------------------- 按钮 -----------------------------
type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "sm" | "md";
  block?: boolean;
}
export function Button({
  variant = "primary",
  size = "md",
  block,
  className = "",
  ...rest
}: ButtonProps) {
  const cls = [
    "btn",
    `btn-${variant}`,
    size === "sm" ? "btn-sm" : "",
    block ? "btn-block" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return <button className={cls} {...rest} />;
}

// ----------------------------- 卡片 -----------------------------
export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`card ${className}`}>{children}</div>;
}
export function CardHead({
  title,
  extra,
}: {
  title: React.ReactNode;
  extra?: React.ReactNode;
}) {
  return (
    <div className="card-head">
      <div className="card-title">{title}</div>
      {extra ? <div className="row">{extra}</div> : null}
    </div>
  );
}
export function CardBody({ children }: { children: React.ReactNode }) {
  return <div className="card-body">{children}</div>;
}

// ----------------------------- 表单 -----------------------------
export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="field">
      <label className="field-label">{label}</label>
      {children}
    </div>
  );
}
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = "", ...rest }, ref) {
    return <input ref={ref} className={`input ${className}`} {...rest} />;
  }
);
export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className = "", ...rest }, ref) {
  return <textarea ref={ref} className={`textarea ${className}`} {...rest} />;
});
export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className = "", children, ...rest }, ref) {
  return (
    <select ref={ref} className={`select ${className}`} {...rest}>
      {children}
    </select>
  );
});

// ----------------------------- 开关 -----------------------------
export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
}) {
  return (
    <label className="toggle" title={label}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="track">
        <span className="thumb" />
      </span>
    </label>
  );
}

// ----------------------------- 徽标 -----------------------------
type BadgeTone = "default" | "bamboo" | "amber" | "cinnabar";
export function Badge({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: BadgeTone;
}) {
  const cls = tone === "default" ? "badge" : `badge badge-${tone}`;
  return <span className={cls}>{children}</span>;
}

// ----------------------------- 空态 / 加载 / 横幅 -----------------------------
export function Empty({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {hint ? <div>{hint}</div> : null}
    </div>
  );
}
export function Spinner({ center }: { center?: boolean }) {
  return <span className={center ? "spinner spinner-center" : "spinner"} />;
}
export function Banner({
  kind = "info",
  children,
}: {
  kind?: "info" | "error" | "amber";
  children: React.ReactNode;
}) {
  const cls =
    kind === "error" ? "banner banner-error" : kind === "amber" ? "banner banner-amber" : "banner banner-info";
  return <div className={cls}>{children}</div>;
}

// ----------------------------- 弹窗 -----------------------------
export function Modal({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

// ----------------------------- 加载/错误内容包装 -----------------------------
export function AsyncRegion({
  loading,
  error,
  empty,
  children,
}: {
  loading: boolean;
  error: string | null;
  empty?: React.ReactNode;
  children: React.ReactNode;
}) {
  if (loading) return <Spinner center />;
  if (error)
    return (
      <Banner kind="error">
        加载失败：{error}（请确认对应后端服务已启动并可达）
      </Banner>
    );
  return <>{children}</>;
}
