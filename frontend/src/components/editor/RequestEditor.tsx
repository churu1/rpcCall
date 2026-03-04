import { useState, useRef, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore, type MetadataEntry } from "@/store/app-store";
import { Plus, Trash2, Braces, WrapText, Minimize2, Sparkles, Loader2 } from "lucide-react";
import { SearchBar, type SearchMatch } from "@/components/search/SearchBar";
import { BenchmarkPanel } from "@/components/benchmark/BenchmarkPanel";
import { ChainEditor } from "@/components/chain/ChainEditor";
import { MockPanel } from "@/components/mock/MockPanel";
import { DecodePanel } from "@/components/decode/DecodePanel";
import { PanelTabs } from "@/components/ui/PanelTabs";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { JsonEditor } from "./JsonEditor";
import { AutocompletePopup } from "./AutocompletePopup";

function parseJsonToEntries(json: string): MetadataEntry[] | null {
  try {
    const obj = JSON.parse(json);
    if (typeof obj !== "object" || obj === null || Array.isArray(obj)) return null;
    return Object.entries(obj).map(([key, value]) => ({
      key,
      value: typeof value === "string" ? value : JSON.stringify(value),
      enabled: true,
    }));
  } catch {
    return null;
  }
}

function entriesToJson(entries: MetadataEntry[]): string {
  const obj: Record<string, string> = {};
  for (const e of entries) {
    if (e.key) obj[e.key] = e.value;
  }
  return JSON.stringify(obj, null, 2);
}

function MetadataTable({
  entries,
  onChange,
}: {
  entries: MetadataEntry[];
  onChange: (entries: MetadataEntry[]) => void;
}) {
  const { t } = useTranslation();
  const [jsonMode, setJsonMode] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const jsonTextareaRef = useRef<HTMLTextAreaElement>(null);

  const addEntry = () => {
    onChange([...entries, { key: "", value: "", enabled: true }]);
  };

  const removeEntry = (index: number) => {
    onChange(entries.filter((_, i) => i !== index));
  };

  const updateEntry = (index: number, updates: Partial<MetadataEntry>) => {
    onChange(entries.map((e, i) => (i === index ? { ...e, ...updates } : e)));
  };

  const switchToJson = () => {
    setJsonText(entriesToJson(entries));
    setJsonError(null);
    setJsonMode(true);
  };

  const applyJson = () => {
    const parsed = parseJsonToEntries(jsonText);
    if (parsed) {
      onChange(parsed);
      setJsonError(null);
      setJsonMode(false);
    } else {
      setJsonError(t("metadata.invalidJson"));
    }
  };

  const handleJsonFormat = () => {
    try {
      const formatted = JSON.stringify(JSON.parse(jsonText), null, 2);
      setJsonText(formatted);
      setJsonError(null);
    } catch { /* ignore */ }
  };

  const handleJsonMinify = () => {
    try {
      const minified = JSON.stringify(JSON.parse(jsonText));
      setJsonText(minified);
      setJsonError(null);
    } catch { /* ignore */ }
  };

  if (jsonMode) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-2 pt-2">
          <span className="text-[10px] text-[var(--text-muted)]">
            {t("metadata.jsonFormat")}
          </span>
          <div className="flex gap-1">
            <button
              onClick={handleJsonFormat}
              className="text-[10px] px-2 py-0.5 rounded hover:bg-[var(--surface-1)] text-[var(--text-muted)] flex items-center gap-0.5"
            >
              <WrapText size={10} /> {t("editor.format")}
            </button>
            <button
              onClick={handleJsonMinify}
              className="text-[10px] px-2 py-0.5 rounded hover:bg-[var(--surface-1)] text-[var(--text-muted)] flex items-center gap-0.5"
            >
              <Minimize2 size={10} /> {t("editor.minify")}
            </button>
            <button
              onClick={() => setJsonMode(false)}
              className="text-[10px] px-2 py-0.5 rounded hover:bg-[var(--surface-1)] text-[var(--text-muted)]"
            >
              {t("common.cancel")}
            </button>
            <button
              onClick={applyJson}
              className="text-[10px] px-2 py-0.5 rounded bg-[var(--state-info)] text-white hover:bg-[var(--state-info)]/80"
            >
              {t("metadata.apply")}
            </button>
          </div>
        </div>
        {jsonError && (
          <div className="px-2 pt-1 text-[10px] text-[var(--state-error)]">{jsonError}</div>
        )}
        <textarea
          ref={jsonTextareaRef}
          value={jsonText}
          onChange={(e) => { setJsonText(e.target.value); setJsonError(null); }}
          onKeyDown={(e) => {
            if (e.key === "Tab") {
              e.preventDefault();
              const el = jsonTextareaRef.current;
              if (!el) return;
              const start = el.selectionStart;
              const end = el.selectionEnd;
              const insert = "  ";
              const newText = jsonText.slice(0, start) + insert + jsonText.slice(end);
              setJsonText(newText);
              setJsonError(null);
              requestAnimationFrame(() => {
                el.focus();
                const newPos = start + insert.length;
                el.setSelectionRange(newPos, newPos);
              });
            }
          }}
          className="flex-1 bg-transparent text-xs p-2 resize-none focus:outline-none font-mono leading-relaxed"
          placeholder={'{\n  "authorization": "Bearer token...",\n  "x-request-id": "abc123"\n}'}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          autoFocus
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 p-2">
      <div className="flex items-center justify-end mb-1">
        <button
          onClick={switchToJson}
          className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-normal)] px-1.5 py-0.5 rounded hover:bg-[var(--surface-1)]"
          title="切换为 JSON 编辑模式"
        >
          <Braces size={11} /> JSON
        </button>
      </div>
      {entries.map((entry, i) => (
        <div key={i} className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={entry.enabled}
            onChange={(e) => updateEntry(i, { enabled: e.target.checked })}
            className="shrink-0"
          />
          <Input
            type="text"
            value={entry.key}
            onChange={(e) => updateEntry(i, { key: e.target.value })}
            placeholder="key"
            className="flex-1 text-xs"
          />
          <Input
            type="text"
            value={entry.value}
            onChange={(e) => updateEntry(i, { value: e.target.value })}
            placeholder="value"
            className="flex-1 text-xs"
          />
          <button
            onClick={() => removeEntry(i)}
            className="p-1 hover:bg-[var(--surface-1)] rounded text-[var(--text-muted)] hover:text-[var(--state-error)]"
          >
            <Trash2 size={12} />
          </button>
        </div>
      ))}
      <button
        onClick={addEntry}
        className="flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-normal)] py-1"
      >
        <Plus size={12} /> {t("metadata.addMetadata")}
      </button>
    </div>
  );
}

export function RequestEditor() {
  const { t } = useTranslation();
  const { activeTabId, tabs, updateTab } = useAppStore();
  const tab = tabs.find((t) => t.id === activeTabId);
  const [activePanel, setActivePanel] = useState<"body" | "metadata" | "benchmark" | "chain" | "mock" | "decode">("body");
  const [decodeSeedPayload, setDecodeSeedPayload] = useState("");
  const [decodeSeedMessageType, setDecodeSeedMessageType] = useState("");
  const [decodeSeedTick, setDecodeSeedTick] = useState(0);
  const [decodeBatchTick, setDecodeBatchTick] = useState(0);
  const [showSearch, setShowSearch] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [acFields, setAcFields] = useState<FieldInfo[]>([]);
  const [acVisible, setAcVisible] = useState(false);
  const [acPosition, setAcPosition] = useState({ top: 0, left: 0 });
  const [acFilter, setAcFilter] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const handleHighlight = useCallback((_matches: SearchMatch[], _currentIndex: number) => {
    // For textarea, highlighting is done via setSelectionRange in onScrollTo
  }, []);

  const handleScrollTo = useCallback((match: SearchMatch) => {
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(match.start, match.end);
    // Scroll textarea so the selection is visible
    const text = el.value.substring(0, match.start);
    const lines = text.split("\n");
    const lineHeight = 22;
    const targetScroll = Math.max(0, (lines.length - 3) * lineHeight);
    el.scrollTop = targetScroll;
  }, []);

  const handleBodyKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Tab") {
        e.preventDefault();
        const el = textareaRef.current;
        if (!el || !tab) return;
        const start = el.selectionStart;
        const end = el.selectionEnd;
        const insert = "  ";
        const newBody =
          tab.requestBody.slice(0, start) + insert + tab.requestBody.slice(end);
        updateTab(tab.id, { requestBody: newBody });
        requestAnimationFrame(() => {
          el.focus();
          const newPos = start + insert.length;
          el.setSelectionRange(newPos, newPos);
        });
      }
    },
    [tab, updateTab]
  );

  useEffect(() => {
    if (!tab?.method || !tab?.projectId) {
      setAcFields([]);
      return;
    }
    window.go.main.App.GetMessageFields(tab.projectId, tab.method.serviceName, tab.method.methodName)
      .then((fields) => setAcFields(fields ?? []))
      .catch(() => setAcFields([]));
  }, [tab?.projectId, tab?.method?.serviceName, tab?.method?.methodName]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        e.stopPropagation();
        setShowSearch((prev) => !prev);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        if (activePanel === "body" && acFields.length > 0) {
          const rect = containerRef.current?.getBoundingClientRect();
          if (rect) {
            setAcPosition({ top: rect.top + 60, left: rect.left + 20 });
            setAcVisible(true);
            setAcFilter("");
          }
        }
      }
    };
    el.addEventListener("keydown", handleKeyDown);
    return () => el.removeEventListener("keydown", handleKeyDown);
  }, [acFields.length, activePanel]);

  useEffect(() => {
    const openHandler = () => setActivePanel("decode");
    const openBatchHandler = () => {
      setActivePanel("decode");
      setDecodeBatchTick((v) => v + 1);
    };
    const decodeFromResponse = (e: Event) => {
      const custom = e as CustomEvent<{ payload?: string; messageType?: string }>;
      setDecodeSeedPayload(custom.detail?.payload || "");
      setDecodeSeedMessageType(custom.detail?.messageType || "");
      setDecodeSeedTick((v) => v + 1);
      setActivePanel("decode");
    };
    document.addEventListener("rpccall:open-decode", openHandler);
    document.addEventListener("rpccall:open-decode-batch", openBatchHandler);
    document.addEventListener("rpccall:decode-payload", decodeFromResponse as EventListener);
    return () => {
      document.removeEventListener("rpccall:open-decode", openHandler);
      document.removeEventListener("rpccall:open-decode-batch", openBatchHandler);
      document.removeEventListener("rpccall:decode-payload", decodeFromResponse as EventListener);
    };
  }, []);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("rpccall:decode-active", {
      detail: { active: activePanel === "decode" },
    }));
  }, [activePanel]);

  if (!tab) return null;

  const panels = [
    { key: "body" as const, label: t("panels.requestBody") },
    { key: "metadata" as const, label: `${t("panels.metadata")} (${tab.metadata.length})` },
    { key: "decode" as const, label: t("panels.decode") },
    { key: "benchmark" as const, label: t("panels.benchmark") },
    { key: "chain" as const, label: t("panels.chain") },
    { key: "mock" as const, label: t("panels.mock") },
  ];

  const handleFormat = () => {
    try {
      const formatted = JSON.stringify(JSON.parse(tab.requestBody), null, 2);
      updateTab(tab.id, { requestBody: formatted });
    } catch { /* ignore invalid JSON */ }
  };

  const handleMinify = () => {
    try {
      const minified = JSON.stringify(JSON.parse(tab.requestBody));
      updateTab(tab.id, { requestBody: minified });
    } catch { /* ignore invalid JSON */ }
  };

  const handleMetadataFormat = () => {
    if (!tab) return;
    const json = entriesToJson(tab.metadata);
    try {
      const formatted = JSON.stringify(JSON.parse(json), null, 2);
      const parsed = parseJsonToEntries(formatted);
      if (parsed) updateTab(tab.id, { metadata: parsed });
    } catch { /* ignore */ }
  };

  const handleMetadataMinify = () => {
    if (!tab) return;
    const json = entriesToJson(tab.metadata);
    try {
      const minified = JSON.stringify(JSON.parse(json));
      const parsed = parseJsonToEntries(minified);
      if (parsed) updateTab(tab.id, { metadata: parsed });
    } catch { /* ignore */ }
  };

  const handleAIGenerate = async () => {
    if (!tab?.method || aiLoading) return;
    setAiLoading(true);
    setAiError(null);
    try {
      if (!tab.projectId) return;
      const body = await window.go.main.App.AIGenerateBody(
        tab.projectId,
        tab.method.serviceName,
        tab.method.methodName
      );
      if (body) updateTab(tab.id, { requestBody: body });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setAiError(msg);
      setTimeout(() => setAiError(null), 5000);
    }
    setAiLoading(false);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[var(--surface-1)]" ref={containerRef} tabIndex={-1}>
      <div className="border-b border-[var(--line-soft)] min-h-[33px] relative" style={{ display: "grid", gridTemplateColumns: (activePanel === "body" || activePanel === "metadata") ? "1fr auto" : "1fr" }}>
        <div className="overflow-x-auto scrollbar-none flex items-center" style={{ minWidth: 0 }}>
          <PanelTabs tabs={panels} active={activePanel} onChange={setActivePanel} />
        </div>
        {(activePanel === "body" || activePanel === "metadata") && (
          <div className="flex items-center gap-1 pr-2 shrink-0 border-l border-[var(--line-soft)] pl-2">
            {activePanel === "body" && tab.method && (
              <IconButton
                onClick={handleAIGenerate}
                disabled={aiLoading}
                size="sm"
                tone="primary"
                className="h-7 w-7 border-transparent bg-transparent"
                title={t("ai.generate")}
                aria-label={t("ai.generate")}
              >
                {aiLoading ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
              </IconButton>
            )}
            <IconButton
              onClick={activePanel === "body" ? handleFormat : handleMetadataFormat}
              size="sm"
              className="h-7 w-7 border-transparent bg-transparent"
              title={t("editor.format")}
              aria-label={t("editor.format")}
            >
              <WrapText size={11} />
            </IconButton>
            <IconButton
              onClick={activePanel === "body" ? handleMinify : handleMetadataMinify}
              size="sm"
              className="h-7 w-7 border-transparent bg-transparent"
              title={t("editor.minify")}
              aria-label={t("editor.minify")}
            >
              <Minimize2 size={11} />
            </IconButton>
          </div>
        )}
      </div>
      {aiError && (
        <div className="px-3 py-1.5 text-[11px] text-[var(--state-error)] bg-[var(--state-error)]/10 border-b border-[var(--line-soft)]">
          AI: {aiError}
        </div>
      )}
      {activePanel === "body" && (
        <SearchBar
          visible={showSearch}
          onClose={() => setShowSearch(false)}
          text={tab.requestBody}
          onHighlight={handleHighlight}
          onScrollTo={handleScrollTo}
        />
      )}
      <div className="flex-1 overflow-auto min-h-0">
        {activePanel === "body" ? (
          <JsonEditor
            value={tab.requestBody}
            onChange={(val) => updateTab(tab.id, { requestBody: val })}
            placeholder='{\n  "field": "value"\n}'
          />
        ) : activePanel === "metadata" ? (
          <MetadataTable
            entries={tab.metadata}
            onChange={(metadata) => updateTab(tab.id, { metadata })}
          />
        ) : activePanel === "chain" ? (
          <ChainEditor />
        ) : activePanel === "mock" ? (
          <MockPanel />
        ) : activePanel === "decode" ? (
          <DecodePanel
            seedPayload={decodeSeedPayload}
            seedMessageType={decodeSeedMessageType}
            seedTick={decodeSeedTick}
            forceBatchTick={decodeBatchTick}
          />
        ) : (
          <BenchmarkPanel />
        )}
      </div>
      <AutocompletePopup
        fields={acFields}
        visible={acVisible}
        position={acPosition}
        filter={acFilter}
        onSelect={(field) => {
          setAcVisible(false);
          if (!tab) return;
          const body = tab.requestBody;
          const lastBrace = body.lastIndexOf("}");
          if (lastBrace === -1) return;
          let defaultVal = '""';
          if (field.typeName.includes("int") || field.typeName.includes("INT") || field.typeName.includes("float") || field.typeName.includes("FLOAT") || field.typeName.includes("double") || field.typeName.includes("DOUBLE")) defaultVal = "0";
          else if (field.typeName.includes("bool") || field.typeName.includes("BOOL")) defaultVal = "false";
          else if (field.repeated) defaultVal = "[]";
          else if (field.mapEntry) defaultVal = "{}";
          const insert = `  "${field.name}": ${defaultVal}`;
          const before = body.substring(0, lastBrace).trimEnd();
          const needComma = before.length > 0 && !before.endsWith("{") && !before.endsWith(",");
          const newBody = before + (needComma ? ",\n" : "\n") + insert + "\n}";
          updateTab(tab.id, { requestBody: newBody });
        }}
        onClose={() => setAcVisible(false)}
      />
    </div>
  );
}
