import { useState, useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore, type MetadataEntry } from "@/store/app-store";
import { cn } from "@/lib/utils";
import { Clock, AlertCircle, CheckCircle2, Sparkles, Loader2, ChevronDown, Stethoscope, X } from "lucide-react";
import { SearchBar, HighlightedText, type SearchMatch } from "@/components/search/SearchBar";
import { TimingBar } from "./TimingBar";
import { highlightJsonHtml } from "@/components/editor/JsonEditor";
import { JsonTreeViewer } from "./JsonTreeViewer";

function ReadonlyMetadataTable({ entries, emptyText }: { entries: MetadataEntry[]; emptyText: string }) {
  if (entries.length === 0) {
    return (
      <div className="p-3 text-xs text-[var(--color-muted-foreground)]">{emptyText}</div>
    );
  }
  return (
    <div className="flex flex-col gap-0.5 p-2">
      {entries.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 text-xs font-[var(--font-mono)]">
          <span className="text-[var(--color-primary)] shrink-0">{entry.key}:</span>
          <span className="text-[var(--color-muted-foreground)] truncate">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

export function ResponseViewer() {
  const { t } = useTranslation();
  const { activeTabId, tabs } = useAppStore();
  const tab = tabs.find((t) => t.id === activeTabId);
  const [activePanel, setActivePanel] = useState<"body" | "headers" | "trailers">("body");
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

  if (!tab) return null;

  const isHttp = tab.tabType === "http";
  const responsePanels: readonly ("body" | "headers" | "trailers")[] = isHttp
    ? ["body", "headers"]
    : ["body", "headers", "trailers"];

  const statusColor = tab.statusCode
    ? tab.statusCode === "OK" || (isHttp && String(tab.statusCode).startsWith("2"))
      ? "text-[var(--color-method-unary)]"
      : "text-[var(--color-destructive)]"
    : "";

  return (
    <div className="flex flex-col h-full" ref={containerRef} tabIndex={-1}>
      <div className="flex items-center justify-between border-b">
        <div className="flex items-center">
          {responsePanels.map((panel) => (
            <button
              key={panel}
              className={cn(
                "px-3 py-1.5 text-xs font-medium transition-colors border-b-2",
                activePanel === panel
                  ? "border-[var(--color-primary)] text-[var(--color-foreground)]"
                  : "border-transparent text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
              )}
              onClick={() => setActivePanel(panel)}
            >
              {panel === "body"
                ? t("panels.response")
                : panel === "headers"
                  ? `${t("panels.headers")} (${tab.responseMetadata.length})`
                  : `${t("panels.trailers")} (${tab.responseTrailers.length})`}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 px-3 text-xs">
          {tab.statusCode && tab.statusCode !== "OK" && !isHttp && tab.method && (
            <button
              onClick={handleAIDiagnose}
              disabled={aiLoading}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[var(--color-destructive)] hover:bg-[var(--color-destructive)]/10 transition-colors disabled:opacity-50"
              title={t("ai.diagnose")}
            >
              {aiLoading && aiType === "diagnose" ? <Loader2 size={12} className="animate-spin" /> : <Stethoscope size={12} />}
              <span className="text-[10px]">{aiLoading && aiType === "diagnose" ? t("ai.diagnosing") : t("ai.diagnose")}</span>
            </button>
          )}
          {tab.responseBody && tab.method && (
            <button
              onClick={handleAIAnalyze}
              disabled={aiLoading}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 transition-colors disabled:opacity-50"
              title={t("ai.analyze")}
            >
              {aiLoading && aiType === "analyze" ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              <span className="text-[10px]">{aiLoading && aiType === "analyze" ? t("ai.analyzing") : t("ai.analyze")}</span>
            </button>
          )}
          {tab.statusCode && (
            <span className={cn("flex items-center gap-1 font-medium", statusColor)}>
              {tab.statusCode === "OK" ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
              {tab.statusCode}
            </span>
          )}
          {tab.elapsedMs !== null && (
            <span className="flex items-center gap-1 text-[var(--color-muted-foreground)]">
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
          <button
            onClick={() => setViewMode("raw")}
            className={cn("text-[10px] px-2 py-0.5 rounded", viewMode === "raw" ? "bg-[var(--color-primary)]/20 text-[var(--color-primary)]" : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]")}
          >
            {t("response.raw")}
          </button>
          <button
            onClick={() => setViewMode("tree")}
            className={cn("text-[10px] px-2 py-0.5 rounded", viewMode === "tree" ? "bg-[var(--color-primary)]/20 text-[var(--color-primary)]" : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]")}
          >
            {t("response.tree")}
          </button>
        </div>
      )}
      {(aiResult || aiError) && (
        <div className="border-b">
          <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--color-muted)]/30">
            <span className="text-[11px] font-medium text-[var(--color-foreground)] flex items-center gap-1.5">
              {aiType === "diagnose" ? <Stethoscope size={12} /> : <Sparkles size={12} />}
              {aiType === "diagnose" ? t("ai.diagnosisTitle") : t("ai.analysisTitle")}
            </span>
            <button
              onClick={closeAIPanel}
              className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-colors"
            >
              <X size={14} />
            </button>
          </div>
          <div className="max-h-[200px] overflow-auto px-3 py-2">
            {aiError ? (
              <div className="text-[11px] text-[var(--color-destructive)]">{aiError}</div>
            ) : (
              <pre className="text-[11px] leading-relaxed whitespace-pre-wrap text-[var(--color-foreground)] font-[var(--font-mono)]">
                {aiResult}
              </pre>
            )}
          </div>
        </div>
      )}
      <div className="flex-1 overflow-auto selectable">
        {activePanel === "body" ? (
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
            <div className="flex items-center justify-center h-full text-[var(--color-muted-foreground)] text-xs">
              {t("response.noResponse")}
            </div>
          )
        ) : activePanel === "headers" ? (
          <ReadonlyMetadataTable entries={tab.responseMetadata} emptyText={t("response.noEntries")} />
        ) : (
          <ReadonlyMetadataTable entries={tab.responseTrailers} emptyText={t("response.noEntries")} />
        )}
      </div>
    </div>
  );
}
