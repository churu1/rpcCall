import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "@/store/app-store";
import { cn } from "@/lib/utils";
import { Clock, Trash2, RefreshCw, CheckCircle2, AlertCircle, ChevronUp, ChevronDown, GitCompareArrows, Globe } from "lucide-react";
import { DiffViewer } from "./DiffViewer";

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

type UnifiedEntry = { type: "grpc"; id: number; key: string; timestamp: string; entry: HistoryEntry } | { type: "http"; id: number; key: string; timestamp: string; entry: HttpHistoryEntryLike };

interface HttpHistoryEntryLike {
  id: number;
  timestamp: string;
  method: string;
  url: string;
  statusCode: number;
  elapsedMs: number;
  error?: string;
}

export function HistoryPanel() {
  const { t } = useTranslation();
  const { addTab, updateTab } = useAppStore();
  const [unified, setUnified] = useState<UnifiedEntry[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [compareKeys, setCompareKeys] = useState<Set<string>>(new Set());
  const [diffData, setDiffData] = useState<{ left: HistoryDetail; right: HistoryDetail } | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      const [grpcList, httpList] = await Promise.all([
        window.go.main.App.GetHistory(50),
        window.go.main.App.GetHttpHistory(50),
      ]);
      const grpcEntries = (grpcList || []).map((e: HistoryEntry) => ({
        type: "grpc" as const,
        id: e.id,
        key: `grpc-${e.id}`,
        timestamp: e.timestamp,
        entry: e,
      }));
      const httpEntries = (httpList || []).map((e: HttpHistoryEntryLike) => ({
        type: "http" as const,
        id: e.id,
        key: `http-${e.id}`,
        timestamp: e.timestamp,
        entry: e,
      }));
      const merged = [...grpcEntries, ...httpEntries].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      setUnified(merged);
    } catch {
      setUnified([]);
    }
  }, []);

  useEffect(() => {
    loadHistory();
    const interval = setInterval(loadHistory, 5000);
    return () => clearInterval(interval);
  }, [loadHistory]);

  const handleReplay = async (item: UnifiedEntry) => {
    setSelectedKey(item.key);
    if (item.type === "grpc") {
      try {
        const detail: HistoryDetail = await window.go.main.App.GetHistoryDetail(item.id);
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
          responseBody: detail.responseBody ?? "",
          responseMetadata: detail.responseHeaders?.map((m) => ({ ...m, enabled: true })) ?? [],
          responseTrailers: detail.responseTrailers?.map((m) => ({ ...m, enabled: true })) ?? [],
          statusCode: detail.statusCode || null,
          elapsedMs: detail.elapsedMs || null,
        });
      } catch { /* ignore */ }
      return;
    }
    try {
      const detail = await window.go.main.App.GetHttpHistoryDetail(item.id);
      if (!detail) return;
      const tabId = addTab(undefined, "http");
      updateTab(tabId, {
        httpMethod: detail.method as any,
        httpUrl: detail.url,
        httpHeaders: detail.requestHeaders?.map((h) => ({ key: h.key, value: h.value, enabled: true })) ?? [],
        requestBody: detail.requestBody ?? "",
        responseBody: detail.responseBody ?? "",
        responseMetadata: detail.responseHeaders?.map((h) => ({ key: h.key, value: h.value, enabled: true })) ?? [],
        statusCode: String(detail.statusCode),
        elapsedMs: detail.elapsedMs,
      });
    } catch { /* ignore */ }
  };

  const handleDelete = async (item: UnifiedEntry) => {
    try {
      if (item.type === "grpc") {
        await window.go.main.App.DeleteHistory(item.id);
      } else {
        await window.go.main.App.DeleteHttpHistory(item.id);
      }
      setUnified((prev) => prev.filter((u) => u.key !== item.key));
    } catch { /* ignore */ }
  };

  const handleClearAll = async () => {
    try {
      await Promise.all([
        window.go.main.App.ClearHistory(),
        window.go.main.App.ClearHttpHistory(),
      ]);
      setUnified([]);
    } catch { /* ignore */ }
  };

  const handleClick = (item: UnifiedEntry, e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) {
      setCompareKeys((prev) => {
        const next = new Set(prev);
        if (next.has(item.key)) {
          next.delete(item.key);
        } else if (item.type === "grpc" && next.size < 2) {
          const arr = Array.from(next);
          if (arr.length === 1 && unified.find((u) => u.key === arr[0])?.type !== "grpc") return prev;
          next.add(item.key);
        } else if (next.size >= 2 && item.type === "grpc") {
          const grpcKeys = Array.from(next).filter((k) => unified.find((u) => u.key === k)?.type === "grpc");
          next.delete(grpcKeys[0]);
          next.add(item.key);
        }
        return next;
      });
    } else {
      setCompareKeys(new Set());
      handleReplay(item);
    }
  };

  const handleCompare = async () => {
    const keys = Array.from(compareKeys).filter((k) => unified.find((u) => u.key === k)?.type === "grpc");
    if (keys.length !== 2) return;
    const [id1, id2] = keys.map((k) => unified.find((u) => u.key === k)!.id);
    try {
      const [left, right] = await Promise.all([
        window.go.main.App.GetHistoryDetail(id1),
        window.go.main.App.GetHistoryDetail(id2),
      ]);
      if (left && right) setDiffData({ left, right });
    } catch { /* ignore */ }
  };

  const compareGrpcKeys = Array.from(compareKeys).filter((k) => unified.find((u) => u.key === k)?.type === "grpc");

  return (
    <div className={cn("border-t bg-[var(--color-card)]", collapsed ? "h-8" : "h-48")}>
      <div className="flex items-center justify-between px-3 h-8 border-b">
        <button
          className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {t("history.title")} ({unified.length})
        </button>
        <div className="flex items-center gap-1">
          {compareGrpcKeys.length === 2 && (
            <button
              onClick={handleCompare}
              className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary)]/80"
              title={t("history.compare")}
            >
              <GitCompareArrows size={11} />
              {t("history.compare")}
            </button>
          )}
          {compareGrpcKeys.length === 1 && (
            <span className="flex items-center gap-1 text-[10px] text-[var(--color-primary)]">
              <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-[var(--color-primary)] text-white text-[8px] font-bold">A</span>
              {t("history.selectToCompare")}
            </span>
          )}
          <button
            onClick={loadHistory}
            className="p-1 hover:bg-[var(--color-secondary)] rounded text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
            title={t("services.reload")}
          >
            <RefreshCw size={12} />
          </button>
          {unified.length > 0 && (
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
          {unified.length === 0 ? (
            <div className="flex items-center justify-center h-full text-[var(--color-muted-foreground)] text-xs">
              {t("history.noHistory")}
            </div>
          ) : (
            unified.map((item) => {
              const compareArr = Array.from(compareGrpcKeys);
              const compareIndex = compareArr.indexOf(item.key);
              const isCompare = compareIndex !== -1;
              const ok = item.type === "grpc" ? item.entry.statusCode === "OK" : item.entry.statusCode >= 200 && item.entry.statusCode < 300;
              return (
                <div
                  key={item.key}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 cursor-pointer text-xs border-b border-[var(--color-border)]/50 group transition-colors duration-150",
                    selectedKey === item.key && !isCompare
                      ? "bg-[var(--color-primary)]/10 border-l-2 border-l-[var(--color-primary)] pl-2.5"
                      : isCompare
                        ? "bg-[var(--color-primary)]/8 border-l-2 border-l-[var(--color-primary)] pl-2.5"
                        : "hover:bg-[var(--color-secondary)]"
                  )}
                  onClick={(e) => handleClick(item, e)}
                >
                  {isCompare ? (
                    <span className="flex items-center justify-center w-4 h-4 rounded-full bg-[var(--color-primary)] text-white text-[9px] font-bold shrink-0">
                      {compareIndex === 0 ? "A" : "B"}
                    </span>
                  ) : ok ? (
                    <CheckCircle2 size={12} className="text-[var(--color-method-unary)] shrink-0" />
                  ) : (
                    <AlertCircle size={12} className="text-[var(--color-destructive)] shrink-0" />
                  )}
                  {item.type === "http" ? (
                    <span title="HTTP"><Globe size={12} className="text-[var(--color-muted-foreground)] shrink-0" /></span>
                  ) : null}
                  <span className="text-[var(--color-muted-foreground)] font-mono text-[10px] shrink-0">
                    {new Date(item.timestamp).toLocaleTimeString()}
                  </span>
                  {item.type === "grpc" ? (
                    <>
                      <span className="truncate font-medium">
                        {item.entry.serviceName}/{item.entry.methodName}
                      </span>
                      <span className="text-[var(--color-muted-foreground)] truncate">
                        {item.entry.address}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="font-mono text-[10px] px-1 rounded bg-[var(--color-secondary)] shrink-0">
                        {item.entry.method}
                      </span>
                      <span className="truncate text-[var(--color-muted-foreground)]">
                        {item.entry.url}
                      </span>
                    </>
                  )}
                  <span className="flex items-center gap-0.5 text-[var(--color-muted-foreground)] shrink-0 ml-auto">
                    <Clock size={10} />
                    {item.entry.elapsedMs}ms
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(item);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-[var(--color-muted)] rounded text-[var(--color-muted-foreground)] hover:text-[var(--color-destructive)]"
                    title={t("common.delete")}
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}
      {diffData && (
        <DiffViewer
          left={diffData.left}
          right={diffData.right}
          onClose={() => setDiffData(null)}
        />
      )}
    </div>
  );
}
