import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "@/store/app-store";
import { cn } from "@/lib/utils";
import { scoreFuzzyText } from "@/lib/fuzzy-search";
import { Clock, Trash2, RefreshCw, CheckCircle2, AlertCircle, ChevronUp, ChevronDown, GitCompareArrows, Search } from "lucide-react";
import { DiffViewer } from "./DiffViewer";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { HISTORY_LIST_LIMIT } from "@/lib/history-limits";

const INITIAL_VISIBLE_COUNT = 100;
const VISIBLE_STEP = 100;

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
  useTls: boolean;
  certPath: string;
  keyPath: string;
  caPath: string;
}

export function HistoryPanel() {
  const { t } = useTranslation();
  const { addTab, updateTab } = useAppStore();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [compareIds, setCompareIds] = useState<Set<number>>(new Set());
  const [diffData, setDiffData] = useState<{ left: HistoryDetail; right: HistoryDetail } | null>(null);
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_COUNT);

  const loadHistory = useCallback(async () => {
    try {
      const data = await window.go.main.App.GetHistory(HISTORY_LIST_LIMIT);
      setEntries(data || []);
    } catch {
      setEntries([]);
    }
  }, []);

  useEffect(() => {
    loadHistory();
    const onRefresh = () => loadHistory();
    window.addEventListener("rpccall:history-refresh", onRefresh);
    const interval = setInterval(loadHistory, 30000);
    return () => {
      window.removeEventListener("rpccall:history-refresh", onRefresh);
      clearInterval(interval);
    };
  }, [loadHistory]);

  const handleReplay = async (entry: HistoryEntry) => {
    setSelectedId(entry.id);
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
        responseBody: detail.responseBody ?? "",
        responseMetadata: detail.responseHeaders?.map((m) => ({ ...m, enabled: true })) ?? [],
        responseTrailers: detail.responseTrailers?.map((m) => ({ ...m, enabled: true })) ?? [],
        statusCode: detail.statusCode || null,
        elapsedMs: detail.elapsedMs || null,
        useTls: detail.useTls ?? false,
        certPath: detail.certPath ?? "",
        keyPath: detail.keyPath ?? "",
        caPath: detail.caPath ?? "",
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

  const handleClick = (entry: HistoryEntry, e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) {
      setCompareIds((prev) => {
        const next = new Set(prev);
        if (next.has(entry.id)) {
          next.delete(entry.id);
        } else if (next.size < 2) {
          next.add(entry.id);
        } else {
          const arr = Array.from(next);
          next.delete(arr[0]);
          next.add(entry.id);
        }
        return next;
      });
    } else {
      setCompareIds(new Set());
      handleReplay(entry);
    }
  };

  const handleCompare = async () => {
    const ids = Array.from(compareIds);
    if (ids.length !== 2) return;
    try {
      const [left, right] = await Promise.all([
        window.go.main.App.GetHistoryDetail(ids[0]),
        window.go.main.App.GetHistoryDetail(ids[1]),
      ]);
      if (left && right) setDiffData({ left, right });
    } catch { /* ignore */ }
  };

  const filteredEntries = useMemo(() => {
    const q = query.trim();
    if (!q) return entries;
    return entries.filter((entry) => {
      const text = [
        entry.serviceName,
        entry.methodName,
        entry.address,
        entry.statusCode,
        entry.error || "",
      ].join(" ");
      return scoreFuzzyText(text, q) >= 0;
    });
  }, [entries, query]);

  const visibleEntries = filteredEntries.slice(0, visibleCount);
  const hasMore = visibleEntries.length < filteredEntries.length;

  const handleQueryChange = (value: string) => {
    setQuery(value);
    setVisibleCount(INITIAL_VISIBLE_COUNT);
    setCompareIds(new Set());
  };

  return (
    <div className={cn("border-t border-[var(--line-soft)] bg-[var(--surface-1)]", collapsed ? "h-8" : "h-48")}>
      <div className="flex items-center justify-between px-3 h-8 border-b border-[var(--line-soft)]">
        <button
          className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--text-normal)]"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {t("history.title")} ({entries.length})
        </button>
        <div className="flex items-center gap-1">
          {compareIds.size === 2 && (
            <Button
              onClick={handleCompare}
              size="sm"
              variant="primary"
              className="h-6 px-2 text-[10px]"
              title={t("history.compare")}
            >
              <GitCompareArrows size={11} />
              {t("history.compare")}
            </Button>
          )}
          {compareIds.size === 1 && (
            <span className="flex items-center gap-1 text-[10px] text-[var(--state-info)]">
              <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-[var(--state-info)] text-white text-[8px] font-bold">A</span>
              {t("history.selectToCompare")}
            </span>
          )}
          <IconButton
            size="sm"
            className="h-6 w-6 border-0 bg-transparent"
            onClick={loadHistory}
            title={t("services.reload")}
          >
            <RefreshCw size={12} />
          </IconButton>
          {entries.length > 0 && (
            <IconButton
              size="sm"
              tone="danger"
              className="h-6 w-6 border-0 bg-transparent"
              onClick={handleClearAll}
              title={t("history.clear")}
            >
              <Trash2 size={12} />
            </IconButton>
          )}
        </div>
      </div>
      {!collapsed && (
        <div className="flex flex-col" style={{ height: "calc(100% - 2rem)" }}>
          {entries.length > 0 && (
            <div className="flex items-center gap-1 px-2 py-1 border-b border-[var(--line-soft)] shrink-0">
              <Search size={11} className="text-[var(--text-muted)] shrink-0" />
              <input
                value={query}
                onChange={(e) => handleQueryChange(e.target.value)}
                placeholder={t("history.searchPlaceholder")}
                className="flex-1 min-w-0 bg-transparent text-[11px] outline-none placeholder:text-[var(--text-muted)]"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                data-form-type="other"
                data-lpignore="true"
              />
              {query && (
                <button
                  onClick={() => handleQueryChange("")}
                  className="text-[var(--text-muted)] hover:text-[var(--text-normal)] text-[10px] px-1"
                  title={t("common.clear")}
                >
                  ✕
                </button>
              )}
            </div>
          )}
          <div className="overflow-y-auto flex-1">
            {entries.length === 0 ? (
              <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-xs">
                {t("history.noHistory")}
              </div>
            ) : filteredEntries.length === 0 ? (
              <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-xs">
                {t("history.noFilteredHistory")}
              </div>
            ) : (
              <>
                {visibleEntries.map((entry) => {
                  const compareArr = Array.from(compareIds);
                  const compareIndex = compareArr.indexOf(entry.id);
                  const isCompare = compareIndex !== -1;
                  return (
                  <div
                    key={entry.id}
                    className={cn(
                      "flex items-center gap-2 px-3 py-1.5 cursor-pointer text-xs border-b border-[var(--line-soft)] group transition-colors duration-150",
                      selectedId === entry.id && !isCompare
                        ? "bg-[var(--state-info)]/12 border-l-2 border-l-[var(--state-info)] pl-2.5"
                        : isCompare
                          ? "bg-[var(--state-info)]/8 border-l-2 border-l-[var(--state-info)] pl-2.5"
                          : "hover:bg-[var(--surface-2)]"
                    )}
                    onClick={(e) => handleClick(entry, e)}
                  >
                    {isCompare ? (
                      <span className="flex items-center justify-center w-4 h-4 rounded-full bg-[var(--state-info)] text-white text-[9px] font-bold shrink-0">
                        {compareIndex === 0 ? "A" : "B"}
                      </span>
                    ) : entry.statusCode === "OK" ? (
                      <CheckCircle2 size={12} className="text-[var(--color-method-unary)] shrink-0" />
                    ) : (
                      <AlertCircle size={12} className="text-[var(--state-error)] shrink-0" />
                    )}
                    <span className="text-[var(--text-muted)] font-mono text-[10px] shrink-0">
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </span>
                    <span className="truncate font-medium">
                      {entry.serviceName}/{entry.methodName}
                    </span>
                    <span className="text-[var(--text-muted)] truncate">
                      {entry.address}
                    </span>
                    <span className="flex items-center gap-0.5 text-[var(--text-muted)] shrink-0 ml-auto">
                      <Clock size={10} />
                      {entry.elapsedMs}ms
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(entry.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-[var(--surface-1)] rounded text-[var(--text-muted)] hover:text-[var(--state-error)]"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                  );
                })}
                {hasMore && (
                  <button
                    onClick={() => setVisibleCount((c) => c + VISIBLE_STEP)}
                    className="w-full py-1.5 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-normal)] hover:bg-[var(--surface-2)] transition-colors"
                  >
                    {t("history.loadMore", { shown: visibleEntries.length, total: filteredEntries.length })}
                  </button>
                )}
              </>
            )}
          </div>
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
