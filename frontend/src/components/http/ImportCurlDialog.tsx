import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "@/store/app-store";
import { HTTP_METHODS, type HttpMethod } from "@/store/app-store";
import { cn } from "@/lib/utils";
import { Terminal } from "lucide-react";

interface ImportCurlDialogProps {
  onClose: () => void;
  /** If set, update this tab; otherwise create a new HTTP tab and switch to it */
  tabId?: string | null;
}

export function ImportCurlDialog({ onClose, tabId }: ImportCurlDialogProps) {
  const { t } = useTranslation();
  const { addTab, updateTab, tabs } = useAppStore();
  const [curlText, setCurlText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const applyToTab = (targetId: string, method: string, url: string, headers: { key: string; value: string }[], body: string) => {
    const methodUpper = method.toUpperCase();
    const safeMethod: HttpMethod = HTTP_METHODS.includes(methodUpper as HttpMethod) ? (methodUpper as HttpMethod) : "GET";
    updateTab(targetId, {
      tabType: "http",
      httpMethod: safeMethod,
      httpUrl: url,
      httpHeaders: headers.map((h) => ({ key: h.key, value: h.value, enabled: true })),
      requestBody: body,
    });
  };

  const handleImport = async () => {
    const raw = curlText.trim();
    if (!raw) {
      setError(t("http.curlEmpty"));
      return;
    }
    setError(null);
    try {
      const req = await window.go.main.App.ParseCurlToHttpRequest(raw);
      if (!req) {
        setError(t("http.curlParseError"));
        return;
      }
      const targetId = tabId && tabs.some((t) => t.id === tabId && t.tabType === "http") ? tabId : addTab(undefined, "http");
      applyToTab(targetId, req.method, req.url, req.headers || [], req.body || "");
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg || t("http.curlParseError"));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border)]">
          <Terminal size={18} className="text-[var(--color-primary)]" />
          <h2 className="text-sm font-semibold text-[var(--color-foreground)]">{t("http.importCurl")}</h2>
        </div>
        <div className="p-4 flex-1 min-h-0 flex flex-col gap-2">
          <p className="text-xs text-[var(--color-muted-foreground)]">
            {t("http.importCurlHint")}
          </p>
          <textarea
            value={curlText}
            onChange={(e) => { setCurlText(e.target.value); setError(null); }}
            placeholder={`curl -X POST 'https://api.example.com/endpoint' -H 'Content-Type: application/json' -d '{"key":"value"}'`}
            className={cn(
              "w-full flex-1 min-h-[180px] rounded border bg-[var(--color-secondary)] px-3 py-2 text-xs font-mono text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--color-ring)] resize-none",
              error ? "border-[var(--color-destructive)]" : "border-[var(--color-input)]"
            )}
            spellCheck={false}
          />
          {error && (
            <p className="text-xs text-[var(--color-destructive)]">{error}</p>
          )}
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-[var(--color-border)]">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs rounded border border-[var(--color-input)] bg-[var(--color-secondary)] text-[var(--color-foreground)] hover:bg-[var(--color-accent)]"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={handleImport}
            className="px-3 py-1.5 text-xs rounded bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary)]/80"
          >
            {t("http.import")}
          </button>
        </div>
      </div>
    </div>
  );
}
