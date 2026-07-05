import { type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./Button";

interface ConfirmDialogProps {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "primary" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel,
  variant = "danger",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onCancel}>
      <div
        className="w-[360px] max-w-[90vw] rounded-xl border border-[var(--line-soft)] bg-[var(--surface-0)] p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 text-sm font-semibold text-[var(--text-strong)]">{title}</div>
        <div className="mb-4 text-xs leading-relaxed text-[var(--text-muted)]">{message}</div>
        <div className="flex justify-end gap-2">
          <Button onClick={onCancel} variant="ghost">
            {cancelLabel ?? t("common.cancel")}
          </Button>
          <Button onClick={onConfirm} variant={variant}>
            {confirmLabel ?? t("common.confirm")}
          </Button>
        </div>
      </div>
    </div>
  );
}
