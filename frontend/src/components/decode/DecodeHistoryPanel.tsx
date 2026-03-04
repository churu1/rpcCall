import { useEffect, useState, useCallback } from "react";
import { RefreshCw, Trash2, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { scoreFuzzyText } from "@/lib/fuzzy-search";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { IconButton } from "@/components/ui/IconButton";

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
    <div className={`h-full flex flex-col bg-[var(--surface-1)] ${embedded ? "" : "border-l border-[var(--line-soft)]"}`}>
      <div className="h-8 border-b border-[var(--line-soft)] px-2 flex items-center justify-between text-[11px]">
        <span className="font-medium text-[var(--text-muted)] uppercase tracking-wider">
          {t("decode.historyTitle")} ({entries.length})
        </span>
        <div className="flex items-center gap-1">
          <IconButton
            size="sm"
            className="h-6 w-6 border-0 bg-transparent"
            onClick={load}
            disabled={loading}
            title={t("services.reload")}
          >
            <RefreshCw size={11} className={cn(loading && "animate-spin")} />
          </IconButton>
          {entries.length > 0 && (
            <IconButton
              size="sm"
              tone="danger"
              className="h-6 w-6 border-0 bg-transparent"
              onClick={handleClear}
              title={t("history.clear")}
            >
              <Trash2 size={11} />
            </IconButton>
          )}
        </div>
      </div>
      <div className="border-b border-[var(--line-soft)] p-2 flex flex-col gap-1.5">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("decode.searchPlaceholder")}
          className="w-full text-[11px] h-7"
        />
        <div className="grid grid-cols-2 gap-1">
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "all" | "ok" | "failed")}
            className="text-[11px] h-7"
          >
            <option value="all">{t("decode.filterStatusAll")}</option>
            <option value="ok">{t("decode.okUpper")}</option>
            <option value="failed">{t("decode.failUpper")}</option>
          </Select>
          <Select
            value={encodingFilter}
            onChange={(e) => setEncodingFilter(e.target.value)}
            className="text-[11px] h-7"
          >
            <option value="all">{t("decode.filterEncodingAll")}</option>
            {encodingOptions.map((enc) => (
              <option key={enc} value={enc}>
                {enc}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {filteredEntries.map((entry) => (
          <div
            key={entry.id}
            className="px-2 py-1.5 border-b border-[var(--line-soft)] text-[11px] hover:bg-[var(--surface-2)] group cursor-pointer"
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
                      <AlertCircle size={11} className="text-[var(--state-error)]" />
                    )}
                    <span className="font-medium truncate">{title}</span>
                    <span className="ml-auto text-[10px] text-[var(--text-muted)]">
                      {entry.elapsedMs}ms
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center text-[10px] text-[var(--text-muted)]">
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
                      className="ml-auto opacity-0 group-hover:opacity-100 hover:text-[var(--state-error)]"
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
          <div className="h-full flex items-center justify-center text-xs text-[var(--text-muted)]">
            {entries.length === 0 ? t("decode.noHistory") : t("decode.noFilteredHistory")}
          </div>
        )}
      </div>
    </div>
  );
}
