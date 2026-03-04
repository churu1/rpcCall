import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { X, Trash2, Clock, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { IconButton } from "@/components/ui/IconButton";
import { SectionHeader } from "@/components/ui/SectionHeader";

interface Props {
  onClose: () => void;
  onLoadResult: (result: BenchmarkResult) => void;
}

export function BenchmarkHistory({ onClose, onLoadResult }: Props) {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<BenchmarkHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

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
    load();
  };

  const handleClear = async () => {
    await window.go.main.App.ClearBenchmarkHistory();
    setEntries([]);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <Card className="w-[620px] max-h-[72vh] flex flex-col p-0 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <SectionHeader
          title={t("benchmark.history")}
          className="h-11 px-3 text-xs"
          right={(
            <div className="flex items-center gap-1">
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
            entries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center gap-3 px-3 py-2.5 border-b border-[var(--line-soft)] hover:bg-[var(--surface-1)] cursor-pointer group text-xs"
                onClick={() => { onLoadResult(entry.result); onClose(); }}
              >
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
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
