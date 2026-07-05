import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface PrevFieldsPanelProps {
  prevResultBody: string | undefined;
  onInsert: (dotpath: string) => void;
}

interface FieldNode {
  key: string;
  path: string;
  kind: "leaf" | "object" | "array";
  preview: string;
  children?: FieldNode[];
}

function buildFieldNodes(value: unknown, prefix: string): FieldNode[] {
  if (Array.isArray(value)) {
    const nodes: FieldNode[] = [];
    value.slice(0, 50).forEach((item, idx) => {
      const path = prefix ? `${prefix}[${idx}]` : `[${idx}]`;
      nodes.push(buildSingleNode(item, path, `[${idx}]`));
    });
    if (value.length > 50) {
      nodes.push({
        key: `... (${value.length - 50} more)`,
        path: "",
        kind: "leaf",
        preview: "",
      });
    }
    return nodes;
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).map(([key, child]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return buildSingleNode(child, path, key);
    });
  }
  return [];
}

function buildSingleNode(child: unknown, path: string, key: string): FieldNode {
  if (Array.isArray(child)) {
    return {
      key,
      path,
      kind: "array",
      preview: `[${child.length}]`,
      children: buildFieldNodes(child, path),
    };
  }
  if (child && typeof child === "object") {
    const keys = Object.keys(child as Record<string, unknown>);
    return {
      key,
      path,
      kind: "object",
      preview: `{${keys.length}}`,
      children: buildFieldNodes(child, path),
    };
  }
  let preview = "";
  if (typeof child === "string") preview = `"${child.length > 20 ? child.slice(0, 20) + "…" : child}"`;
  else if (child === null) preview = "null";
  else preview = String(child);
  return { key, path, kind: "leaf", preview };
}

function FieldRow({ node, depth, onInsert }: { node: FieldNode; depth: number; onInsert: (p: string) => void }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(depth < 1);

  if (node.kind === "leaf" && !node.path) {
    return (
      <div className="text-[10px] text-[var(--text-muted)] py-0.5" style={{ paddingLeft: depth * 12 }}>
        {node.key}
      </div>
    );
  }

  const isContainer = node.kind === "object" || node.kind === "array";

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1 py-0.5 text-[10px] rounded",
          isContainer ? "cursor-pointer hover:bg-[var(--surface-2)]" : "cursor-pointer hover:bg-[var(--state-info)]/12"
        )}
        style={{ paddingLeft: depth * 12 }}
        onClick={() => {
          if (isContainer) {
            setExpanded((e) => !e);
          } else {
            onInsert(node.path);
          }
        }}
        title={isContainer ? undefined : t("chain.insertVar")}
      >
        {isContainer ? (
          expanded ? <ChevronDown size={9} className="shrink-0 text-[var(--text-muted)]" /> : <ChevronRight size={9} className="shrink-0 text-[var(--text-muted)]" />
        ) : (
          <span className="w-[9px] shrink-0" />
        )}
        <span className="font-mono text-[var(--state-info)] shrink-0">{node.key}</span>
        <span className="text-[var(--text-muted)] shrink-0">{node.preview}</span>
        {!isContainer && (
          <span className="ml-auto text-[9px] text-[var(--text-muted)] opacity-0 hover:opacity-100 transition-opacity font-mono">
            {`{{prev.${node.path}}}`}
          </span>
        )}
      </div>
      {isContainer && expanded && node.children && (
        <div>
          {node.children.map((child, idx) => (
            <FieldRow key={idx} node={child} depth={depth + 1} onInsert={onInsert} />
          ))}
        </div>
      )}
    </div>
  );
}

export function PrevFieldsPanel({ prevResultBody, onInsert }: PrevFieldsPanelProps) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);

  const fields = useMemo<FieldNode[]>(() => {
    if (!prevResultBody) return [];
    try {
      const parsed = JSON.parse(prevResultBody);
      return buildFieldNodes(parsed, "");
    } catch {
      return [];
    }
  }, [prevResultBody]);

  if (!prevResultBody) return null;

  return (
    <div className="rounded border border-[var(--line-soft)] bg-[var(--surface-2)]/40">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center gap-1 px-2 py-1 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-normal)]"
      >
        {collapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
        {t("chain.prevFields")}
        <span className="ml-auto opacity-70">{t("chain.prevFieldsHint")}</span>
      </button>
      {!collapsed && (
        <div className="px-1.5 pb-1.5 max-h-[140px] overflow-y-auto">
          {fields.length === 0 ? (
            <div className="text-[10px] text-[var(--text-muted)] py-1">{t("chain.prevFieldsEmpty")}</div>
          ) : (
            fields.map((node, idx) => (
              <FieldRow key={idx} node={node} depth={0} onInsert={onInsert} />
            ))
          )}
        </div>
      )}
    </div>
  );
}
