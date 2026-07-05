import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { X, Trash2, Clock, RefreshCw, GitCompareArrows } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/Card";
import { IconButton } from "@/components/ui/IconButton";
import { Button } from "@/components/ui/Button";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { BenchmarkCompareDialog } from "./BenchmarkCompareDialog";

interface Props {
  onClose: () => void;
  onLoadResult: (result: BenchmarkResult) => void;
}

export function BenchmarkHistory({ onClose, onLoadResult }: Props) {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<BenchmarkHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [compareIds, setCompareIds] = useState<Set<number>>(new Set());
  const [compareData, setCompareData] = useState<{ left: BenchmarkHistoryEntry; right: BenchmarkHistoryEntry } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await window.go.main.App.ListBenchmarkHistory(50);
      setEntries(data ?? []);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    await window.go.main.App.DeleteBenchmarkHistory(id);
    setCompareIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    load();
  };

  const handleClear = async () => {
    await window.go.main.App.ClearBenchmarkHistory();
    setEntries([]);
    setCompareIds(new Set());
  };

  const handleClick = (entry: BenchmarkHistoryEntry, e: React.MouseEvent) => {
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
      onLoadResult(entry.result);
      onClose();
    }
  };

  const handleCompare = () => {
    const ids = Array.from(compareIds);
    if (ids.length !== 2) return;
    const left = entries.find((e) => e.id === ids[0]);
    const right = entries.find((e) => e.id === ids[1]);
    if (left && right) setCompareData({ left, right });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <Card className="w-[620px] max-h-[72vh] flex flex-col p-0 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <SectionHeader
          title={`${t("benchmark.history")} (${entries.length})`}
          className="h-11 px-3 text-xs"
          right={(
            <div className="flex items-center gap-1">
              {compareIds.size === 2 && (
                <Button
                  onClick={handleCompare}
                  size="sm"
                  variant="primary"
                  className="h-6 px-2 text-[10px]"
                  title={t("benchmark.compare")}
                >
                  <GitCompareArrows size={11} />
                  {t("benchmark.compare")}
                </Button>
              )}
              {compareIds.size === 1 && (
                <span className="flex items-center gap-1 text-[10px] text-[var(--state-info)]">
                  <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-[var(--state-info)] text-white text-[8px] font-bold">A</span>
                  {t("benchmark.selectToCompare")}
                </span>
              )}
              <IconButton onClick={load} size="sm" title={t("services.reload")} aria-label={t("services.reload")}>
                <RefreshCw size={14} />
              </IconButton>
              {entries.length > 0 && (
                <IconButton onClick={handleClear} size="sm" tone="danger" title={t("history.clearAll")} aria-label={t("history.clearAll")}>
                  <Trash2 size={14} />
                </IconButton>
              )}
              <IconButton onClick={onClose} size="sm" title={t("common.close")} aria-label={t("common.close")}>
                <X size={14} />
              </IconButton>
            </div>
          )}
        />
        <div className="overflow-auto flex-1">
          {loading ? (
            <div className="p-4 text-xs text-center text-[var(--text-muted)]">{t("collections.loading")}</div>
          ) : entries.length === 0 ? (
            <div className="p-8 text-xs text-center text-[var(--text-muted)]">{t("history.noHistory")}</div>
          ) : (
            entries.map((entry) => {
              const compareArr = Array.from(compareIds);
              const compareIndex = compareArr.indexOf(entry.id);
              const isCompare = compareIndex !== -1;
              return (
                <div
                  key={entry.id}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 border-b border-[var(--line-soft)] cursor-pointer group text-xs transition-colors",
                    isCompare
                      ? "bg-[var(--state-info)]/8 border-l-2 border-l-[var(--state-info)] pl-2.5"
                      : "hover:bg-[var(--surface-1)]"
                  )}
                  onClick={(e) => handleClick(entry, e)}
                >
                  {isCompare ? (
                    <span className="flex items-center justify-center w-4 h-4 rounded-full bg-[var(--state-info)] text-white text-[9px] font-bold shrink-0">
                      {compareIndex === 0 ? "A" : "B"}
                    </span>
                  ) : null}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate text-[var(--text-strong)]">
                      {entry.serviceName}/{entry.methodName}
                    </div>
                    <div className="text-[10px] text-[var(--text-muted)] flex items-center gap-2 mt-0.5">
                      <span className="truncate max-w-[240px]">{entry.address}</span>
                      <span>·</span>
                      <span>QPS: {entry.result.currentQps.toFixed(1)}</span>
                      <span>·</span>
                      <span>P99: {entry.result.p99Ms.toFixed(1)}ms</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] shrink-0">
                    <Clock size={10} />
                    {new Date(entry.createdAt).toLocaleString()}
                  </div>
                  <IconButton
                    onClick={(e) => handleDelete(e, entry.id)}
                    tone="danger"
                    size="sm"
                    className="opacity-0 group-hover:opacity-100 border-transparent bg-transparent"
                    title={t("common.delete")}
                    aria-label={t("common.delete")}
                  >
                    <Trash2 size={12} />
                  </IconButton>
                </div>
              );
            })
          )}
        </div>
      </Card>
      {compareData && (
        <BenchmarkCompareDialog
          left={compareData.left}
          right={compareData.right}
          onClose={() => {
            setCompareData(null);
            setCompareIds(new Set());
          }}
        />
      )}
    </div>
  );
}
