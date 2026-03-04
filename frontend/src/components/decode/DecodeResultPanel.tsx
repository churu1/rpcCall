import { useEffect, useState } from "react";
import { Copy, GitCompareArrows, ChevronDown, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { highlightJsonHtml } from "@/components/editor/JsonEditor";
import { DecodeHistoryPanel } from "./DecodeHistoryPanel";
import { DecodeDiffViewer } from "./DecodeDiffViewer";
import { JsonTreeViewer } from "@/components/response/JsonTreeViewer";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { PanelTabs } from "@/components/ui/PanelTabs";

export function DecodeResultPanel() {
  const { t } = useTranslation();
  const [result, setResult] = useState<DecodeResponse | null>(null);
  const [batchResult, setBatchResult] = useState<DecodeBatchResponse | null>(null);
  const [rightView, setRightView] = useState<"result" | "history">("result");
  const [jsonViewMode, setJsonViewMode] = useState<"tree" | "raw">("tree");
  const [rawTagsExpanded, setRawTagsExpanded] = useState(true);
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
      <div className="px-3 py-1.5 border-b border-[var(--line-soft)] text-[11px] text-[var(--text-muted)] flex items-center gap-2">
        <PanelTabs
          tabs={[
            { key: "result", label: t("decode.result") },
            { key: "history", label: t("decode.historyTitle") },
          ]}
          active={rightView}
          onChange={setRightView}
          className="px-0 py-0"
        />
        {rightView === "result" && result?.detectedEncoding && (
          <Badge>{result.detectedEncoding}</Badge>
        )}
        {rightView === "result" && result?.ok && (
          <PanelTabs
            tabs={[
              { key: "tree", label: t("response.tree") },
              { key: "raw", label: t("response.raw") },
            ]}
            active={jsonViewMode}
            onChange={setJsonViewMode}
            className="px-0 py-0"
          />
        )}
        {rightView === "result" && result && (
          <Button
            className="ml-auto"
            variant="ghost"
            size="sm"
            onClick={() => navigator.clipboard.writeText(result.json || result.error || "")}
          >
            <Copy size={10} /> {t("decode.copy")}
          </Button>
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
                  <span className="text-[var(--state-success)]">{t("decode.ok")} {batchResult.success}</span>
                  <span className="text-[var(--state-error)]">{t("decode.failed")} {batchResult.failed}</span>
                  <Button
                    onClick={compareSelected}
                    disabled={selectedItems.size !== 2}
                    className="ml-auto"
                    variant="ghost"
                    size="sm"
                  >
                    <GitCompareArrows size={11} /> {t("decode.compare")}
                  </Button>
                </div>
                <div className="flex-1 overflow-auto">
                  {batchResult.results.map((item) => {
                    const selected = selectedItems.has(item.index);
                    return (
                      <div
                        key={item.index}
                        className={`p-2 border-b border-[var(--line-soft)] cursor-pointer ${selected ? "bg-[var(--state-info)]/10" : "hover:bg-[var(--surface-1)]"}`}
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
                          <span className={item.ok ? "text-[var(--state-success)]" : "text-[var(--state-error)]"}>
                            {item.ok ? t("decode.okUpper") : t("decode.failUpper")}
                          </span>
                          <span className="text-[var(--text-muted)]">{item.detectedEncoding}</span>
                          <span className="ml-auto text-[var(--text-muted)]">{item.elapsedMs}ms</span>
                        </div>
                        <pre className="mt-1 text-[11px] whitespace-pre-wrap text-[var(--text-muted)] max-h-[90px] overflow-auto">
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
                    {result.rawTags && result.rawTags.length > 0 && (
                      <div className="border-b border-[var(--line-soft)] bg-[var(--surface-1)]">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start px-2 text-[11px]"
                          onClick={() => setRawTagsExpanded((v) => !v)}
                        >
                          {rawTagsExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                          <span className="text-[var(--text-muted)]">{t("decode.rawTags")}</span>
                          <span className="text-[10px] text-[var(--text-muted)]">({result.rawTags.length})</span>
                        </Button>
                        {rawTagsExpanded && (
                          <div className="px-2 pb-1 text-[11px] flex items-center gap-1 flex-wrap">
                            {result.rawTags.map((tag) => (
                              <span key={`${tag.fieldNumber}-${tag.wireType}`} className="px-1.5 py-0.5 rounded bg-[var(--surface-0)] border border-[var(--line-soft)] text-[10px] font-mono text-[var(--text-normal)]">
                                #{tag.fieldNumber}(w{tag.wireType})x{tag.count}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {result.warnings?.length > 0 && (
                      <div className="px-2 py-1 text-[11px] text-[var(--state-warn)] border-b border-[var(--line-soft)] bg-[var(--state-warn)]/10">
                        {result.warnings.join(" | ")}
                      </div>
                    )}
                    {jsonViewMode === "tree" ? (
                      <JsonTreeViewer json={result.json || ""} />
                    ) : (
                      <pre className="text-xs font-mono p-2 whitespace-pre-wrap text-[var(--text-normal)]">
                        <code dangerouslySetInnerHTML={{ __html: highlightJsonHtml(result.json || "") }} />
                      </pre>
                    )}
                  </>
                ) : (
                  <div className="p-2 text-xs text-[var(--state-error)]">
                    [{result.errorCode || t("decode.error")}] {result.error || t("decode.decodeFailed")}
                  </div>
                )}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-[var(--text-muted)]">
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
