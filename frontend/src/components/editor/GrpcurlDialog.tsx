import { useState } from "react";
import { useTranslation } from "react-i18next";
import { X, Copy, Check, Terminal } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { Button } from "@/components/ui/Button";

interface Props {
  command: string;
  isStreaming: boolean;
  onClose: () => void;
}

export function GrpcurlDialog({ command, isStreaming, onClose }: Props) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-[var(--surface-0)] border border-[var(--line-soft)] rounded-lg shadow-[var(--elevation-2)] w-[640px] max-w-[90vw] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--line-soft)]">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <Terminal size={14} />
            {t("grpcurl.title")}
          </h3>
          <IconButton size="sm" className="border-0 bg-transparent" onClick={onClose}>
            <X size={14} />
          </IconButton>
        </div>
        <div className="p-4 flex flex-col gap-3">
          <pre className="bg-[var(--surface-2)] border border-[var(--line-soft)] rounded-md p-3 text-[11px] font-mono text-[var(--text-normal)] overflow-x-auto whitespace-pre-wrap break-all max-h-[300px] overflow-y-auto">
            {command}
          </pre>
          {isStreaming && (
            <div className="text-[11px] text-[var(--state-info)] bg-[var(--state-info)]/10 border border-[var(--state-info)]/30 rounded px-2 py-1.5">
              {t("grpcurl.streamingNote")}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-[var(--line-soft)]">
          <Button onClick={onClose} variant="ghost">
            {t("common.close")}
          </Button>
          <Button onClick={handleCopy} variant="primary">
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? t("grpcurl.copied") : t("grpcurl.copy")}
          </Button>
        </div>
      </div>
    </div>
  );
}
