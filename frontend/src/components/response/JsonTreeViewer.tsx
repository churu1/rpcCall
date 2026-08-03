import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";

interface JsonTreeViewerProps {
  json: string;
  searchQuery?: string;
  currentMatchIndex?: number;
  decodedFields?: Record<string, unknown>;
}

interface SearchRenderContext {
  query: string;
  currentMatchIndex: number;
  nextIndex: number;
}

function appendTreeSearchText(parts: string[], data: unknown, name?: string) {
  if (name !== undefined) {
    parts.push(name);
  }
  if (data === null) {
    parts.push("null");
    return;
  }
  if (typeof data === "string" || typeof data === "number" || typeof data === "boolean") {
    parts.push(String(data));
    return;
  }
  if (Array.isArray(data)) {
    data.forEach((item, i) => appendTreeSearchText(parts, item, String(i)));
    return;
  }
  if (typeof data === "object" && data !== null) {
    Object.entries(data as Record<string, unknown>).forEach(([key, value]) => {
      appendTreeSearchText(parts, value, key);
    });
    return;
  }
  parts.push(String(data));
}

export function buildJsonTreeSearchText(json: string) {
  try {
    const parsed = JSON.parse(json);
    const parts: string[] = [];
    appendTreeSearchText(parts, parsed);
    return parts.join("\u0000");
  } catch {
    return json;
  }
}

function containsSearch(data: unknown, name: string | undefined, query: string): boolean {
  if (!query) return false;
  const q = query.toLowerCase();
  if (name !== undefined && name.toLowerCase().includes(q)) return true;
  if (data === null) return "null".includes(q);
  if (typeof data === "string" || typeof data === "number" || typeof data === "boolean") {
    return String(data).toLowerCase().includes(q);
  }
  if (Array.isArray(data)) {
    return data.some((item, i) => containsSearch(item, String(i), query));
  }
  if (typeof data === "object" && data !== null) {
    return Object.entries(data as Record<string, unknown>).some(([key, value]) => containsSearch(value, key, query));
  }
  return String(data).toLowerCase().includes(q);
}

function HighlightSearchText({
  text,
  ctx,
  className,
}: {
  text: string;
  ctx?: SearchRenderContext;
  className?: string;
}) {
  if (!ctx?.query) {
    return <span className={className}>{text}</span>;
  }

  const lowerText = text.toLowerCase();
  const lowerQuery = ctx.query.toLowerCase();
  const parts: React.ReactNode[] = [];
  let pos = 0;
  let key = 0;

  while (pos < text.length) {
    const idx = lowerText.indexOf(lowerQuery, pos);
    if (idx === -1) break;
    if (idx > pos) {
      parts.push(<span key={key++}>{text.slice(pos, idx)}</span>);
    }

    const matchIndex = ctx.nextIndex++;
    const isCurrent = matchIndex === ctx.currentMatchIndex;
    parts.push(
      <mark
        key={key++}
        className={
          isCurrent
            ? "bg-[var(--state-warn)]/40 text-[var(--text-strong)] rounded-sm px-[1px]"
            : "bg-[var(--state-warn)]/22 text-[var(--text-normal)] rounded-sm px-[1px]"
        }
        {...(isCurrent ? { "data-current-tree-match": "true" } : {})}
      >
        {text.slice(idx, idx + ctx.query.length)}
      </mark>
    );
    pos = idx + ctx.query.length;
  }

  if (pos < text.length) {
    parts.push(<span key={key++}>{text.slice(pos)}</span>);
  }

  return <span className={className}>{parts}</span>;
}

function JsonNode({
  data,
  name,
  depth,
  defaultExpanded,
  searchQuery,
  searchCtx,
  decodedFields,
}: {
  data: unknown;
  name?: string;
  depth: number;
  defaultExpanded: boolean;
  searchQuery: string;
  searchCtx?: SearchRenderContext;
  decodedFields: Record<string, unknown>;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const toggle = useCallback(() => setExpanded((p) => !p), []);
  const hasSearchMatch = useMemo(() => containsSearch(data, name, searchQuery), [data, name, searchQuery]);
  const isExpanded = searchQuery && hasSearchMatch ? true : expanded;
  const nameEl = name !== undefined ? (
    <span className="text-[var(--text-muted)]">
      <HighlightSearchText text={name} ctx={searchCtx} />:
    </span>
  ) : null;

  if (data === null) {
    return (
      <div className="flex items-start gap-1 py-0.5" style={{ paddingLeft: depth * 16 }}>
        {nameEl}
        <HighlightSearchText text="null" ctx={searchCtx} className="text-[var(--state-warn)] italic" />
      </div>
    );
  }

  if (typeof data === "string") {
    const decoded = decodedFields[data];
    if (decoded !== undefined) {
      return (
        <JsonNode
          data={decoded}
          name={name}
          depth={depth}
          defaultExpanded={true}
          searchQuery={searchQuery}
          searchCtx={searchCtx}
          decodedFields={{}}
        />
      );
    }
    return (
      <div className="py-0.5" style={{ paddingLeft: depth * 16 }}>
        <div className="flex items-start gap-1">
          {nameEl}
          <span className="text-[var(--color-syntax-string)]">
            "<HighlightSearchText text={data} ctx={searchCtx} />"
          </span>
        </div>
      </div>
    );
  }

  if (typeof data === "number") {
    return (
      <div className="flex items-start gap-1 py-0.5" style={{ paddingLeft: depth * 16 }}>
        {nameEl}
        <HighlightSearchText text={String(data)} ctx={searchCtx} className="text-[var(--color-syntax-number)]" />
      </div>
    );
  }

  if (typeof data === "boolean") {
    return (
      <div className="flex items-start gap-1 py-0.5" style={{ paddingLeft: depth * 16 }}>
        {nameEl}
        <HighlightSearchText text={String(data)} ctx={searchCtx} className="text-[var(--color-syntax-boolean)]" />
      </div>
    );
  }

  if (Array.isArray(data)) {
    const preview = `Array(${data.length})`;
    return (
      <div>
        <div
          className="flex items-center gap-1 py-0.5 cursor-pointer hover:bg-[var(--surface-1)] rounded"
          style={{ paddingLeft: depth * 16 }}
          onClick={toggle}
        >
          {isExpanded ? <ChevronDown size={12} className="shrink-0 text-[var(--text-muted)]" /> : <ChevronRight size={12} className="shrink-0 text-[var(--text-muted)]" />}
          {nameEl}
          {!isExpanded && <span className="text-[var(--text-muted)]">[{preview}]</span>}
          {isExpanded && <span className="text-[var(--text-muted)]">[</span>}
        </div>
        {isExpanded && (
          <>
            {data.map((item, i) => (
              <JsonNode
                key={i}
                data={item}
                name={String(i)}
                depth={depth + 1}
                defaultExpanded={depth + 1 < 2}
                searchQuery={searchQuery}
                searchCtx={searchCtx}
                decodedFields={decodedFields}
              />
            ))}
            <div style={{ paddingLeft: depth * 16 }} className="text-[var(--text-muted)]">]</div>
          </>
        )}
      </div>
    );
  }

  if (typeof data === "object") {
    const keys = Object.keys(data as Record<string, unknown>);
    const preview = `${keys.length} keys`;
    return (
      <div>
        <div
          className="flex items-center gap-1 py-0.5 cursor-pointer hover:bg-[var(--surface-1)] rounded"
          style={{ paddingLeft: depth * 16 }}
          onClick={toggle}
        >
          {isExpanded ? <ChevronDown size={12} className="shrink-0 text-[var(--text-muted)]" /> : <ChevronRight size={12} className="shrink-0 text-[var(--text-muted)]" />}
          {nameEl}
          {!isExpanded && <span className="text-[var(--text-muted)]">{`{${preview}}`}</span>}
          {isExpanded && <span className="text-[var(--text-muted)]">{"{"}</span>}
        </div>
        {isExpanded && (
          <>
            {keys.map((key) => (
              <JsonNode
                key={key}
                data={(data as Record<string, unknown>)[key]}
                name={key}
                depth={depth + 1}
                defaultExpanded={depth + 1 < 2}
                searchQuery={searchQuery}
                searchCtx={searchCtx}
                decodedFields={decodedFields}
              />
            ))}
            <div style={{ paddingLeft: depth * 16 }} className="text-[var(--text-muted)]">{"}"}</div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-start gap-1 py-0.5" style={{ paddingLeft: depth * 16 }}>
      {nameEl}
      <HighlightSearchText text={String(data)} ctx={searchCtx} />
    </div>
  );
}

export function JsonTreeViewer({
  json,
  searchQuery = "",
  currentMatchIndex = -1,
  decodedFields,
}: JsonTreeViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [localDecodedFields, setLocalDecodedFields] = useState<Record<string, unknown>>({});
  const resolvedDecodedFields = decodedFields ?? localDecodedFields;
  const parsed = useMemo(() => {
    try {
      return JSON.parse(json);
    } catch {
      return null;
    }
  }, [json]);

  useEffect(() => {
    if (decodedFields !== undefined) return;
    let cancelled = false;
    setLocalDecodedFields({});
    if (!json.trim()) return;
    window.go.main.App.DecodeJSONProtobufFields(json)
      .then((res) => {
        if (cancelled || !res) return;
        try {
          setLocalDecodedFields(JSON.parse(res) as Record<string, unknown>);
        } catch {
          // Keep the tree in its original form if decoding metadata is malformed.
        }
      })
      .catch(() => {
        // Keep the tree in its original form if the backend is unavailable.
      });
    return () => {
      cancelled = true;
    };
  }, [json, decodedFields]);

  const normalizedSearchQuery = searchQuery.trim();
  const searchCtx: SearchRenderContext | undefined = normalizedSearchQuery
    ? { query: normalizedSearchQuery, currentMatchIndex, nextIndex: 0 }
    : undefined;

  useEffect(() => {
    if (!normalizedSearchQuery || currentMatchIndex < 0) return;
    requestAnimationFrame(() => {
      const el = containerRef.current?.querySelector("[data-current-tree-match]");
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }, [currentMatchIndex, normalizedSearchQuery]);

  if (parsed === null) {
    return <pre className="text-[var(--rpccall-json-font-size)] text-[var(--text-normal)] p-3 font-mono leading-relaxed whitespace-pre-wrap">{json}</pre>;
  }

  return (
    <div ref={containerRef} className="text-[var(--rpccall-json-font-size)] text-[var(--text-normal)] font-mono p-2 select-text">
      <JsonNode
        data={parsed}
        depth={0}
        defaultExpanded={true}
        searchQuery={normalizedSearchQuery}
        searchCtx={searchCtx}
        decodedFields={resolvedDecodedFields}
      />
    </div>
  );
}
