import { useEffect, useState, useCallback } from "react";
import { RefreshCw, Trash2, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { scoreFuzzyText } from "@/lib/fuzzy-search";

interface Props {
  onSelect: (detail: DecodeHistoryDetail) => void;
  embedded?: boolean;
}

export function DecodeHistoryPanel({ onSelect, embedded = false }: Props) {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<DecodeHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "ok" | "failed">("all");
  const [encodingFilter, setEncodingFilter] = useState<string>("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await window.go.main.App.GetDecodeHistory(200);
      setEntries(data || []);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onRefresh = () => load();
    window.addEventListener("rpccall:decode-history-refresh", onRefresh);
    return () => window.removeEventListener("rpccall:decode-history-refresh", onRefresh);
  }, [load]);

  const handleOpen = async (id: number) => {
    try {
      const detail = await window.go.main.App.GetDecodeHistoryDetail(id);
      if (detail) onSelect(detail);
    } catch {
      // ignore
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await window.go.main.App.DeleteDecodeHistory(id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch {
      // ignore
    }
  };

  const handleClear = async () => {
    try {
      await window.go.main.App.ClearDecodeHistory();
      setEntries([]);
    } catch {
      // ignore
    }
  };

  const filteredEntries = entries.filter((entry) => {
    if (statusFilter === "ok" && !entry.success) return false;
    if (statusFilter === "failed" && entry.success) return false;
    if (encodingFilter !== "all") {
      const enc = (entry.detectedEncoding || entry.inputEncoding || "").toLowerCase();
      if (enc !== encodingFilter.toLowerCase()) return false;
    }
    const q = query.trim();
    if (!q) return true;
    const text = [
      entry.projectName || "",
      entry.projectId || "",
      entry.serviceName,
      entry.methodName,
      entry.target,
      entry.messageType,
      entry.errorCode || "",
      entry.error || "",
    ]
      .join(" ");
    return scoreFuzzyText(text, q) >= 0;
  });

  const encodingOptions = Array.from(
    new Set(entries.map((e) => (e.detectedEncoding || e.inputEncoding || "").toLowerCase()).filter(Boolean))
  ).sort();

  return (
    <div className={`h-full flex flex-col ${embedded ? "" : "border-l"}`}>
      <div className="h-8 border-b px-2 flex items-center justify-between text-[11px]">
        <span className="font-medium text-[var(--color-muted-foreground)] uppercase tracking-wider">
          {t("decode.historyTitle")} ({entries.length})
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={load}
            className="p-1 hover:bg-[var(--color-secondary)] rounded"
            disabled={loading}
            title={t("services.reload")}
          >
            <RefreshCw size={11} className={cn(loading && "animate-spin")} />
          </button>
          {entries.length > 0 && (
            <button
              onClick={handleClear}
              className="p-1 hover:bg-[var(--color-secondary)] rounded text-[var(--color-muted-foreground)] hover:text-[var(--color-destructive)]"
              title={t("history.clear")}
            >
              <Trash2 size={11} />
            </button>
          )}
        </div>
      </div>
      <div className="border-b p-2 flex flex-col gap-1.5">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("decode.searchPlaceholder")}
          className="w-full bg-[var(--color-secondary)] border rounded px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-[var(--color-ring)]"
        />
        <div className="grid grid-cols-2 gap-1">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "all" | "ok" | "failed")}
            className="bg-[var(--color-secondary)] border rounded px-2 py-1 text-[11px]"
          >
            <option value="all">{t("decode.filterStatusAll")}</option>
            <option value="ok">{t("decode.okUpper")}</option>
            <option value="failed">{t("decode.failUpper")}</option>
          </select>
          <select
            value={encodingFilter}
            onChange={(e) => setEncodingFilter(e.target.value)}
            className="bg-[var(--color-secondary)] border rounded px-2 py-1 text-[11px]"
          >
            <option value="all">{t("decode.filterEncodingAll")}</option>
            {encodingOptions.map((enc) => (
              <option key={enc} value={enc}>
                {enc}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {filteredEntries.map((entry) => (
          <div
            key={entry.id}
            className="px-2 py-1.5 border-b text-[11px] hover:bg-[var(--color-secondary)] group cursor-pointer"
            onClick={() => handleOpen(entry.id)}
          >
            {/** message-first display for decode history */}
            {(() => {
              const title =
                (entry.messageType && entry.messageType.trim()) ||
                ((entry.serviceName || entry.methodName)
                  ? `${entry.serviceName}/${entry.methodName}`
                  : "/");
              return (
                <>
                  <div className="flex items-center gap-1">
                    {entry.success ? (
                      <CheckCircle2 size={11} className="text-green-500" />
                    ) : (
                      <AlertCircle size={11} className="text-[var(--color-destructive)]" />
                    )}
                    <span className="font-medium truncate">{title}</span>
                    <span className="ml-auto text-[10px] text-[var(--color-muted-foreground)]">
                      {entry.elapsedMs}ms
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center text-[10px] text-[var(--color-muted-foreground)]">
                    <span className="truncate max-w-[120px]">{entry.projectName || entry.projectId || "-"}</span>
                    <span className="mx-1">·</span>
                    <span className="truncate">{entry.detectedEncoding || entry.inputEncoding}</span>
                    <span className="mx-1">·</span>
                    <span>{entry.payloadSize}B</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(entry.id);
                      }}
                      className="ml-auto opacity-0 group-hover:opacity-100 hover:text-[var(--color-destructive)]"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        ))}
        {filteredEntries.length === 0 && (
          <div className="h-full flex items-center justify-center text-xs text-[var(--color-muted-foreground)]">
            {entries.length === 0 ? t("decode.noHistory") : t("decode.noFilteredHistory")}
          </div>
        )}
      </div>
    </div>
  );
}
