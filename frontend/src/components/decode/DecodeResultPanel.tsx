import { useEffect, useState } from "react";
import { Copy, GitCompareArrows } from "lucide-react";
import { useTranslation } from "react-i18next";
import { highlightJsonHtml } from "@/components/editor/JsonEditor";
import { DecodeHistoryPanel } from "./DecodeHistoryPanel";
import { DecodeDiffViewer } from "./DecodeDiffViewer";

export function DecodeResultPanel() {
  const { t } = useTranslation();
  const [result, setResult] = useState<DecodeResponse | null>(null);
  const [batchResult, setBatchResult] = useState<DecodeBatchResponse | null>(null);
  const [rightView, setRightView] = useState<"result" | "history">("result");
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const [diff, setDiff] = useState<{ leftTitle: string; rightTitle: string; leftText: string; rightText: string } | null>(null);

  useEffect(() => {
    const onOutput = (e: Event) => {
      const custom = e as CustomEvent<{ result: DecodeResponse | null; batchResult: DecodeBatchResponse | null }>;
      setResult(custom.detail?.result ?? null);
      setBatchResult(custom.detail?.batchResult ?? null);
      setSelectedItems(new Set());
      setRightView("result");
    };
    window.addEventListener("rpccall:decode-output", onOutput as EventListener);
    return () => window.removeEventListener("rpccall:decode-output", onOutput as EventListener);
  }, []);

  const onHistorySelect = (detail: DecodeHistoryDetail) => {
    setResult({
      ok: detail.success,
      detectedEncoding: (detail.detectedEncoding as DecodeEncoding) || "auto",
      json: detail.resultJson || "",
      warnings: detail.warnings || [],
      elapsedMs: detail.elapsedMs,
      nestedHits: detail.nestedHits,
      errorCode: detail.errorCode,
      error: detail.error,
    });
    setBatchResult(null);
    setRightView("result");
    window.dispatchEvent(new CustomEvent("rpccall:decode-apply-history", { detail }));
  };

  const compareSelected = () => {
    if (!batchResult) return;
    const ids = Array.from(selectedItems);
    if (ids.length !== 2) return;
    const left = batchResult.results[ids[0]];
    const right = batchResult.results[ids[1]];
    setDiff({
      leftTitle: `#${left.index + 1} ${left.detectedEncoding}`,
      rightTitle: `#${right.index + 1} ${right.detectedEncoding}`,
      leftText: left.json || left.error || "",
      rightText: right.json || right.error || "",
    });
  };

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="px-3 py-1.5 border-b text-[11px] text-[var(--color-muted-foreground)] flex items-center gap-2">
        <button
          className={`px-2 py-0.5 rounded ${rightView === "result" ? "bg-[var(--color-primary)]/20 text-[var(--color-primary)]" : "hover:bg-[var(--color-secondary)]"}`}
          onClick={() => setRightView("result")}
        >
          {t("decode.result")}
        </button>
        <button
          className={`px-2 py-0.5 rounded ${rightView === "history" ? "bg-[var(--color-primary)]/20 text-[var(--color-primary)]" : "hover:bg-[var(--color-secondary)]"}`}
          onClick={() => setRightView("history")}
        >
          {t("decode.historyTitle")}
        </button>
        {rightView === "result" && result?.detectedEncoding && (
          <span className="px-1.5 py-0.5 rounded bg-[var(--color-secondary)]">{result.detectedEncoding}</span>
        )}
        {rightView === "result" && result && (
          <button
            className="ml-auto text-[10px] px-1.5 py-0.5 rounded hover:bg-[var(--color-secondary)] flex items-center gap-1"
            onClick={() => navigator.clipboard.writeText(result.json || result.error || "")}
          >
            <Copy size={10} /> {t("decode.copy")}
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        {rightView === "history" ? (
          <DecodeHistoryPanel onSelect={onHistorySelect} embedded />
        ) : (
          <>
            {batchResult ? (
              <div className="h-full flex flex-col">
                <div className="px-2 py-1 border-b text-[11px] flex items-center gap-2">
                  <span>{t("decode.total")} {batchResult.total}</span>
                  <span className="text-green-500">{t("decode.ok")} {batchResult.success}</span>
                  <span className="text-[var(--color-destructive)]">{t("decode.failed")} {batchResult.failed}</span>
                  <button
                    onClick={compareSelected}
                    disabled={selectedItems.size !== 2}
                    className="ml-auto text-[10px] px-1.5 py-0.5 rounded hover:bg-[var(--color-secondary)] disabled:opacity-50 flex items-center gap-1"
                  >
                    <GitCompareArrows size={11} /> {t("decode.compare")}
                  </button>
                </div>
                <div className="flex-1 overflow-auto">
                  {batchResult.results.map((item) => {
                    const selected = selectedItems.has(item.index);
                    return (
                      <div
                        key={item.index}
                        className={`p-2 border-b cursor-pointer ${selected ? "bg-[var(--color-primary)]/10" : "hover:bg-[var(--color-secondary)]"}`}
                        onClick={() => {
                          setSelectedItems((prev) => {
                            const next = new Set(prev);
                            if (next.has(item.index)) next.delete(item.index);
                            else if (next.size < 2) next.add(item.index);
                            else {
                              const [first] = Array.from(next);
                              next.delete(first);
                              next.add(item.index);
                            }
                            return next;
                          });
                        }}
                      >
                        <div className="text-[11px] flex items-center gap-2">
                          <span>#{item.index + 1}</span>
                          <span className={item.ok ? "text-green-500" : "text-[var(--color-destructive)]"}>
                            {item.ok ? t("decode.okUpper") : t("decode.failUpper")}
                          </span>
                          <span className="text-[var(--color-muted-foreground)]">{item.detectedEncoding}</span>
                          <span className="ml-auto text-[var(--color-muted-foreground)]">{item.elapsedMs}ms</span>
                        </div>
                        <pre className="mt-1 text-[11px] whitespace-pre-wrap text-[var(--color-muted-foreground)] max-h-[90px] overflow-auto">
                          {item.ok ? item.json : `[${item.errorCode}] ${item.error}`}
                        </pre>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : result ? (
              <div className="h-full">
                {result.ok ? (
                  <>
                    {result.warnings?.length > 0 && (
                      <div className="px-2 py-1 text-[11px] text-yellow-500 border-b bg-yellow-500/10">
                        {result.warnings.join(" | ")}
                      </div>
                    )}
                    <pre className="text-xs font-mono p-2 whitespace-pre-wrap">
                      <code dangerouslySetInnerHTML={{ __html: highlightJsonHtml(result.json || "") }} />
                    </pre>
                  </>
                ) : (
                  <div className="p-2 text-xs text-[var(--color-destructive)]">
                    [{result.errorCode || t("decode.error")}] {result.error || t("decode.decodeFailed")}
                  </div>
                )}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-[var(--color-muted-foreground)]">
                {t("decode.resultPlaceholder")}
              </div>
            )}
          </>
        )}
      </div>

      {diff && (
        <DecodeDiffViewer
          leftTitle={diff.leftTitle}
          rightTitle={diff.rightTitle}
          leftText={diff.leftText}
          rightText={diff.rightText}
          onClose={() => setDiff(null)}
        />
      )}
    </div>
  );
}
