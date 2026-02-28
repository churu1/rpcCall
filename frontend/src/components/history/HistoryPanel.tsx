import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "@/store/app-store";
import { cn } from "@/lib/utils";
import { Clock, Trash2, RefreshCw, CheckCircle2, AlertCircle, ChevronUp, ChevronDown } from "lucide-react";

interface HistoryEntry {
  id: number;
  timestamp: string;
  address: string;
  serviceName: string;
  methodName: string;
  statusCode: string;
  elapsedMs: number;
  error?: string;
}

interface HistoryDetail {
  id: number;
  timestamp: string;
  address: string;
  serviceName: string;
  methodName: string;
  statusCode: string;
  elapsedMs: number;
  error?: string;
  requestBody: string;
  requestMetadata: { key: string; value: string }[];
  responseBody: string;
  responseHeaders: { key: string; value: string }[];
  responseTrailers: { key: string; value: string }[];
}

export function HistoryPanel() {
  const { t } = useTranslation();
  const { addTab, updateTab } = useAppStore();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [collapsed, setCollapsed] = useState(false);

  const loadHistory = useCallback(async () => {
    try {
      const data = await window.go.main.App.GetHistory(50);
      setEntries(data || []);
    } catch {
      setEntries([]);
    }
  }, []);

  useEffect(() => {
    loadHistory();
    const interval = setInterval(loadHistory, 5000);
    return () => clearInterval(interval);
  }, [loadHistory]);

  const handleReplay = async (entry: HistoryEntry) => {
    try {
      const detail: HistoryDetail = await window.go.main.App.GetHistoryDetail(entry.id);
      if (!detail) return;

      const tabId = addTab({
        serviceName: detail.serviceName,
        methodName: detail.methodName,
        fullName: `${detail.serviceName}.${detail.methodName}`,
        methodType: "unary",
        inputTypeName: "",
        outputTypeName: "",
      });

      updateTab(tabId, {
        address: detail.address,
        requestBody: detail.requestBody,
        metadata: detail.requestMetadata?.map((m) => ({ ...m, enabled: true })) ?? [],
      });
    } catch {
      // ignore
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await window.go.main.App.DeleteHistory(id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch {
      // ignore
    }
  };

  const handleClearAll = async () => {
    try {
      await window.go.main.App.ClearHistory();
      setEntries([]);
    } catch {
      // ignore
    }
  };

  return (
    <div className={cn("border-t bg-[var(--color-card)]", collapsed ? "h-8" : "h-48")}>
      <div className="flex items-center justify-between px-3 h-8 border-b">
        <button
          className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {t("history.title")} ({entries.length})
        </button>
        <div className="flex items-center gap-1">
          <button
            onClick={loadHistory}
            className="p-1 hover:bg-[var(--color-secondary)] rounded text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
            title={t("services.reload")}
          >
            <RefreshCw size={12} />
          </button>
          {entries.length > 0 && (
            <button
              onClick={handleClearAll}
              className="p-1 hover:bg-[var(--color-secondary)] rounded text-[var(--color-muted-foreground)] hover:text-[var(--color-destructive)]"
              title={t("history.clear")}
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>
      {!collapsed && (
        <div className="overflow-y-auto" style={{ height: "calc(100% - 2rem)" }}>
          {entries.length === 0 ? (
            <div className="flex items-center justify-center h-full text-[var(--color-muted-foreground)] text-xs">
              {t("history.noHistory")}
            </div>
          ) : (
            entries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--color-secondary)] cursor-pointer text-xs border-b border-[var(--color-border)]/50 group"
                onClick={() => handleReplay(entry)}
              >
                {entry.statusCode === "OK" ? (
                  <CheckCircle2 size={12} className="text-[var(--color-method-unary)] shrink-0" />
                ) : (
                  <AlertCircle size={12} className="text-[var(--color-destructive)] shrink-0" />
                )}
                <span className="text-[var(--color-muted-foreground)] font-mono text-[10px] shrink-0">
                  {new Date(entry.timestamp).toLocaleTimeString()}
                </span>
                <span className="truncate font-medium">
                  {entry.serviceName}/{entry.methodName}
                </span>
                <span className="text-[var(--color-muted-foreground)] truncate">
                  {entry.address}
                </span>
                <span className="flex items-center gap-0.5 text-[var(--color-muted-foreground)] shrink-0 ml-auto">
                  <Clock size={10} />
                  {entry.elapsedMs}ms
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(entry.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-[var(--color-muted)] rounded text-[var(--color-muted-foreground)] hover:text-[var(--color-destructive)]"
                >
                  <Trash2 size={10} />
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
