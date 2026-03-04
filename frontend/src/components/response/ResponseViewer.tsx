import { useState, useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore, type MetadataEntry } from "@/store/app-store";
import { cn } from "@/lib/utils";
import { Clock, AlertCircle, CheckCircle2, Sparkles, Loader2, ChevronDown, ChevronRight, Stethoscope, X, Binary } from "lucide-react";
import { SearchBar, HighlightedText, type SearchMatch } from "@/components/search/SearchBar";
import { TimingBar } from "./TimingBar";
import { highlightJsonHtml } from "@/components/editor/JsonEditor";
import { JsonTreeViewer } from "./JsonTreeViewer";
import { DecodeResultPanel } from "@/components/decode/DecodeResultPanel";
import { PanelTabs } from "@/components/ui/PanelTabs";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { IconButton } from "@/components/ui/IconButton";

function ReadonlyMetadataTable({ entries, emptyText }: { entries: MetadataEntry[]; emptyText: string }) {
  if (entries.length === 0) {
    return (
      <div className="p-3 text-xs text-[var(--text-muted)]">{emptyText}</div>
    );
  }
  return (
    <div className="flex flex-col gap-0.5 p-2">
      {entries.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 text-xs font-[var(--font-mono)]">
          <span className="text-[var(--state-info)] shrink-0">{entry.key}:</span>
          <span className="text-[var(--text-muted)] truncate">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

export function ResponseViewer() {
  const { t } = useTranslation();
  const { activeTabId, tabs } = useAppStore();
  const tab = tabs.find((t) => t.id === activeTabId);
  const [activePanel, setActivePanel] = useState<"body" | "headers" | "trailers" | "chain" | "decode">("body");
  const [decodeActive, setDecodeActive] = useState(false);
  const [viewMode, setViewMode] = useState<"raw" | "tree">("raw");
  const [showSearch, setShowSearch] = useState(false);
  const [searchMatches, setSearchMatches] = useState<SearchMatch[]>([]);
  const [searchCurrentIndex, setSearchCurrentIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const preRef = useRef<HTMLPreElement>(null);

  const [aiResult, setAiResult] = useState<string | null>(null);
  const [aiType, setAiType] = useState<"analyze" | "diagnose" | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const handleAIAnalyze = async () => {
    if (!tab?.method || !tab.responseBody || aiLoading) return;
    setAiLoading(true);
    setAiError(null);
    setAiType("analyze");
    try {
      const result = await window.go.main.App.AIAnalyzeResponse(
        tab.method.serviceName,
        tab.method.methodName,
        tab.responseBody,
        tab.statusCode || "UNKNOWN"
      );
      setAiResult(result);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setAiError(msg);
      setAiResult(null);
    }
    setAiLoading(false);
  };

  const handleAIDiagnose = async () => {
    if (!tab?.method || !tab.statusCode || aiLoading) return;
    setAiLoading(true);
    setAiError(null);
    setAiType("diagnose");
    try {
      const trailers = tab.responseTrailers.map((t) => ({ key: t.key, value: t.value }));
      const result = await window.go.main.App.AIDiagnoseError(
        tab.method.serviceName,
        tab.method.methodName,
        tab.statusCode,
        tab.responseBody || "",
        trailers
      );
      setAiResult(result);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setAiError(msg);
      setAiResult(null);
    }
    setAiLoading(false);
  };

  const closeAIPanel = () => {
    setAiResult(null);
    setAiType(null);
    setAiError(null);
  };

  const handleDecodePayload = () => {
    if (!tab?.responseBody) return;
    document.dispatchEvent(new CustomEvent("rpccall:decode-payload", {
      detail: {
        payload: tab.responseBody,
        messageType: tab.method?.outputTypeName || "",
      },
    }));
  };

  const handleHighlight = useCallback((matches: SearchMatch[], currentIndex: number) => {
    setSearchMatches(matches);
    setSearchCurrentIndex(currentIndex);
  }, []);

  const scrollToCurrent = useCallback(() => {
    requestAnimationFrame(() => {
      const el = preRef.current?.querySelector("[data-current-match]");
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }, []);

  useEffect(() => {
    if (searchMatches.length > 0 && searchCurrentIndex >= 0) {
      scrollToCurrent();
    }
  }, [searchCurrentIndex, searchMatches, scrollToCurrent]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        e.stopPropagation();
        setShowSearch((prev) => !prev);
      }
    };
    el.addEventListener("keydown", handleKeyDown);
    return () => el.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const handler = () => setActivePanel("chain");
    document.addEventListener("rpccall:show-chain-results", handler);
    return () => document.removeEventListener("rpccall:show-chain-results", handler);
  }, []);

  useEffect(() => {
    const onDecodeActive = (e: Event) => {
      const custom = e as CustomEvent<{ active?: boolean }>;
      const active = !!custom.detail?.active;
      setDecodeActive(active);
      if (active) {
        setActivePanel("decode");
      } else {
        setActivePanel((prev) => (prev === "decode" ? "body" : prev));
      }
    };
    window.addEventListener("rpccall:decode-active", onDecodeActive as EventListener);
    return () => window.removeEventListener("rpccall:decode-active", onDecodeActive as EventListener);
  }, []);

  const chainResults = tab?.chainResults;
  useEffect(() => {
    if (activePanel === "chain" && (!chainResults || chainResults.length === 0)) {
      setActivePanel("body");
    }
  }, [activePanel, chainResults]);

  if (!tab) return null;

  const responseTabs: { key: "body" | "headers" | "trailers" | "decode" | "chain"; label: string }[] = [
    { key: "body", label: t("panels.response") },
    { key: "headers", label: `${t("panels.headers")} (${tab.responseMetadata.length})` },
    { key: "trailers", label: `${t("panels.trailers")} (${tab.responseTrailers.length})` },
  ];
  if (decodeActive) responseTabs.push({ key: "decode", label: t("decode.result") });
  if (tab.chainResults && tab.chainResults.length > 0) {
    responseTabs.push({ key: "chain", label: `${t("chain.results")} (${tab.chainResults.length})` });
  }

  const statusColor = tab.statusCode
    ? tab.statusCode === "OK"
      ? "text-[var(--state-success)]"
      : "text-[var(--state-error)]"
    : "";

  return (
    <div className="flex flex-col h-full bg-[var(--surface-1)]" ref={containerRef} tabIndex={-1}>
      <div className="flex items-center justify-between border-b border-[var(--line-soft)]">
        <div className="flex items-center overflow-x-auto scrollbar-none">
          <PanelTabs
            active={activePanel}
            onChange={(k) => setActivePanel(k)}
            tabs={responseTabs}
          />
        </div>
        <div className="flex items-center gap-1 px-2 text-xs shrink-0">
          {tab.statusCode && tab.statusCode !== "OK" && tab.method && (
            <IconButton
              onClick={handleAIDiagnose}
              disabled={aiLoading}
              size="sm"
              tone="danger"
              className="h-7 w-7 border-transparent bg-transparent"
              title={t("ai.diagnose")}
              aria-label={t("ai.diagnose")}
            >
              {aiLoading && aiType === "diagnose" ? <Loader2 size={12} className="animate-spin" /> : <Stethoscope size={12} />}
            </IconButton>
          )}
          {tab.responseBody && tab.method && (
            <IconButton
              onClick={handleAIAnalyze}
              disabled={aiLoading}
              size="sm"
              tone="primary"
              className="h-7 w-7 border-transparent bg-transparent"
              title={t("ai.analyze")}
              aria-label={t("ai.analyze")}
            >
              {aiLoading && aiType === "analyze" ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            </IconButton>
          )}
          {tab.responseBody && (
            <IconButton
              onClick={handleDecodePayload}
              size="sm"
              tone="primary"
              className="h-7 w-7 border-transparent bg-transparent"
              title={t("decode.decodeThisPayload")}
              aria-label={t("decode.decodeThisPayload")}
            >
              <Binary size={12} />
            </IconButton>
          )}
          {tab.statusCode && (
            <span className={cn("flex items-center gap-1 font-medium", statusColor)}>
              {tab.statusCode === "OK" ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
              <Badge tone={tab.statusCode === "OK" ? "success" : "danger"}>{tab.statusCode}</Badge>
            </span>
          )}
          {tab.elapsedMs !== null && (
            <span className="flex items-center gap-1 text-[var(--text-muted)]">
              <Clock size={12} />
              {tab.elapsedMs}ms
            </span>
          )}
        </div>
      </div>
      {activePanel === "body" && tab.timing && (
        <TimingBar timing={tab.timing} />
      )}
      {activePanel === "body" && (
        <SearchBar
          visible={showSearch}
          onClose={() => setShowSearch(false)}
          text={tab.responseBody}
          onHighlight={handleHighlight}
        />
      )}
      {activePanel === "body" && tab.responseBody && (
        <div className="flex items-center gap-1 px-3 py-1 border-b">
          <PanelTabs
            active={viewMode}
            onChange={(k) => setViewMode(k)}
            tabs={[
              { key: "raw", label: t("response.raw") },
              { key: "tree", label: t("response.tree") },
            ]}
            className="px-0 py-0"
          />
        </div>
      )}
      {(aiResult || aiError) && (
        <div className="border-b border-[var(--line-soft)]">
          <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--surface-1)]">
            <span className="text-[11px] font-medium text-[var(--text-strong)] flex items-center gap-1.5">
              {aiType === "diagnose" ? <Stethoscope size={12} /> : <Sparkles size={12} />}
              {aiType === "diagnose" ? t("ai.diagnosisTitle") : t("ai.analysisTitle")}
            </span>
            <IconButton onClick={closeAIPanel} size="sm" title={t("common.close")} aria-label={t("common.close")}>
              <X size={14} />
            </IconButton>
          </div>
          <div className="max-h-[200px] overflow-auto px-3 py-2">
            {aiError ? (
              <div className="text-[11px] text-[var(--state-error)]">{aiError}</div>
            ) : (
              <pre className="text-[11px] leading-relaxed whitespace-pre-wrap text-[var(--text-normal)] font-[var(--font-mono)]">
                {aiResult}
              </pre>
            )}
          </div>
        </div>
      )}
      <div className="flex-1 overflow-auto selectable">
        {activePanel === "decode" ? (
          <DecodeResultPanel />
        ) : activePanel === "chain" && tab.chainResults ? (
          <ChainResultsView results={tab.chainResults} />
        ) : activePanel === "body" ? (
          tab.responseBody ? (
            viewMode === "tree" ? (
              <JsonTreeViewer json={tab.responseBody} />
            ) : (
              <pre ref={preRef} className="text-sm p-3 font-[var(--font-mono)] leading-relaxed whitespace-pre-wrap">
                {showSearch && searchMatches.length > 0 ? (
                  <HighlightedText
                    text={tab.responseBody}
                    matches={searchMatches}
                    currentIndex={searchCurrentIndex}
                  />
                ) : (
                  <code dangerouslySetInnerHTML={{ __html: highlightJsonHtml(tab.responseBody) }} />
                )}
              </pre>
            )
          ) : (
            <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-xs">
              {t("response.noResponse")}
            </div>
          )
        ) : activePanel === "headers" ? (
          <ReadonlyMetadataTable entries={tab.responseMetadata} emptyText={t("response.noEntries")} />
        ) : activePanel === "trailers" ? (
          <ReadonlyMetadataTable entries={tab.responseTrailers} emptyText={t("response.noEntries")} />
        ) : null}
      </div>
    </div>
  );
}

function ChainResultsView({ results }: { results: ChainStepResult[] }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set(results.map((_, i) => i)));

  useEffect(() => {
    setExpanded(new Set(results.map((_, i) => i)));
  }, [results]);

  const toggle = (i: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-1 p-2">
      {results.map((r) => (
        <div key={r.index} className="border border-[var(--line-soft)] rounded-lg overflow-hidden bg-[var(--surface-0)]">
          <div
            className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-[var(--surface-1)] transition-colors"
            onClick={() => toggle(r.index)}
          >
            {expanded.has(r.index) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            <span className="text-xs font-medium">{t("chain.stepN", { n: r.index + 1 })}</span>
            <span className={cn(
              "text-[10px] font-mono px-1.5 py-0.5 rounded",
              r.statusCode === "OK"
                ? "text-[var(--state-success)] bg-[var(--state-success)]/12"
                : "text-[var(--state-error)] bg-[var(--state-error)]/12"
            )}>
              {r.statusCode}
            </span>
            <span className="text-[10px] text-[var(--text-muted)] ml-auto flex items-center gap-1">
              <Clock size={10} />
              {r.elapsedMs}ms
            </span>
          </div>
          {expanded.has(r.index) && (
            <pre className="px-3 py-2 text-xs font-[var(--font-mono)] bg-[var(--surface-1)] border-t border-[var(--line-soft)] whitespace-pre-wrap overflow-auto max-h-[300px] leading-relaxed">
              {r.error ? (
                <span className="text-[var(--state-error)]">{r.error}</span>
              ) : r.body ? (
                <code dangerouslySetInnerHTML={{ __html: highlightJsonHtml(r.body) }} />
              ) : (
                <span className="text-[var(--text-muted)]">{t("chain.empty")}</span>
              )}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}
