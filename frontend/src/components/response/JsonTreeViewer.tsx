import { useState, useMemo, useCallback } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";

interface JsonTreeViewerProps {
  json: string;
}

function JsonNode({ data, name, depth, defaultExpanded }: { data: unknown; name?: string; depth: number; defaultExpanded: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const toggle = useCallback(() => setExpanded((p) => !p), []);

  if (data === null) {
    return (
      <div className="flex items-start gap-1 py-0.5" style={{ paddingLeft: depth * 16 }}>
        {name !== undefined && <span className="text-[var(--text-muted)]">{name}:</span>}
        <span className="text-[var(--state-warn)] italic">null</span>
      </div>
    );
  }

  if (typeof data === "string") {
    return (
      <div className="flex items-start gap-1 py-0.5" style={{ paddingLeft: depth * 16 }}>
        {name !== undefined && <span className="text-[var(--text-muted)]">{name}:</span>}
        <span className="text-[var(--color-syntax-string)]">"{data}"</span>
      </div>
    );
  }

  if (typeof data === "number") {
    return (
      <div className="flex items-start gap-1 py-0.5" style={{ paddingLeft: depth * 16 }}>
        {name !== undefined && <span className="text-[var(--text-muted)]">{name}:</span>}
        <span className="text-[var(--color-syntax-number)]">{String(data)}</span>
      </div>
    );
  }

  if (typeof data === "boolean") {
    return (
      <div className="flex items-start gap-1 py-0.5" style={{ paddingLeft: depth * 16 }}>
        {name !== undefined && <span className="text-[var(--text-muted)]">{name}:</span>}
        <span className="text-[var(--color-syntax-boolean)]">{String(data)}</span>
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
          {expanded ? <ChevronDown size={12} className="shrink-0 text-[var(--text-muted)]" /> : <ChevronRight size={12} className="shrink-0 text-[var(--text-muted)]" />}
          {name !== undefined && <span className="text-[var(--text-muted)]">{name}:</span>}
          {!expanded && <span className="text-[var(--text-muted)]">[{preview}]</span>}
          {expanded && <span className="text-[var(--text-muted)]">[</span>}
        </div>
        {expanded && (
          <>
            {data.map((item, i) => (
              <JsonNode key={i} data={item} name={String(i)} depth={depth + 1} defaultExpanded={depth + 1 < 2} />
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
          {expanded ? <ChevronDown size={12} className="shrink-0 text-[var(--text-muted)]" /> : <ChevronRight size={12} className="shrink-0 text-[var(--text-muted)]" />}
          {name !== undefined && <span className="text-[var(--text-muted)]">{name}:</span>}
          {!expanded && <span className="text-[var(--text-muted)]">{`{${preview}}`}</span>}
          {expanded && <span className="text-[var(--text-muted)]">{"{"}</span>}
        </div>
        {expanded && (
          <>
            {keys.map((key) => (
              <JsonNode key={key} data={(data as Record<string, unknown>)[key]} name={key} depth={depth + 1} defaultExpanded={depth + 1 < 2} />
            ))}
            <div style={{ paddingLeft: depth * 16 }} className="text-[var(--text-muted)]">{"}"}</div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-start gap-1 py-0.5" style={{ paddingLeft: depth * 16 }}>
      {name !== undefined && <span className="text-[var(--text-muted)]">{name}:</span>}
      <span>{String(data)}</span>
    </div>
  );
}

export function JsonTreeViewer({ json }: JsonTreeViewerProps) {
  const parsed = useMemo(() => {
    try {
      return JSON.parse(json);
    } catch {
      return null;
    }
  }, [json]);

  if (parsed === null) {
    return <pre className="text-xs text-[var(--text-normal)] p-3 font-mono leading-relaxed whitespace-pre-wrap">{json}</pre>;
  }

  return (
    <div className="text-[11px] text-[var(--text-normal)] font-mono p-2 select-text">
      <JsonNode data={parsed} depth={0} defaultExpanded={true} />
    </div>
  );
}
