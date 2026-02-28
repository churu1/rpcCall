import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { X, Trash2, Clock, RefreshCw } from "lucide-react";

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
      <div className="bg-[var(--color-card)] border rounded-lg shadow-xl w-[600px] max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="text-sm font-medium">{t("benchmark.history")}</h3>
          <div className="flex items-center gap-1">
            <button onClick={load} className="p-1 hover:bg-[var(--color-secondary)] rounded text-[var(--color-muted-foreground)]">
              <RefreshCw size={14} />
            </button>
            {entries.length > 0 && (
              <button onClick={handleClear} className="p-1 hover:bg-[var(--color-secondary)] rounded text-[var(--color-muted-foreground)] hover:text-[var(--color-destructive)]">
                <Trash2 size={14} />
              </button>
            )}
            <button onClick={onClose} className="p-1 hover:bg-[var(--color-secondary)] rounded">
              <X size={14} />
            </button>
          </div>
        </div>
        <div className="overflow-auto flex-1">
          {loading ? (
            <div className="p-4 text-xs text-center text-[var(--color-muted-foreground)]">{t("collections.loading")}</div>
          ) : entries.length === 0 ? (
            <div className="p-8 text-xs text-center text-[var(--color-muted-foreground)]">{t("history.noHistory")}</div>
          ) : (
            entries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center gap-3 px-4 py-2.5 border-b hover:bg-[var(--color-secondary)] cursor-pointer group text-xs"
                onClick={() => { onLoadResult(entry.result); onClose(); }}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">
                    {entry.serviceName}/{entry.methodName}
                  </div>
                  <div className="text-[10px] text-[var(--color-muted-foreground)] flex items-center gap-2 mt-0.5">
                    <span>{entry.address}</span>
                    <span>|</span>
                    <span>QPS: {entry.result.currentQps.toFixed(1)}</span>
                    <span>|</span>
                    <span>P99: {entry.result.p99Ms.toFixed(1)}ms</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-[10px] text-[var(--color-muted-foreground)] shrink-0">
                  <Clock size={10} />
                  {new Date(entry.createdAt).toLocaleString()}
                </div>
                <button
                  onClick={(e) => handleDelete(e, entry.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:text-[var(--color-destructive)]"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
