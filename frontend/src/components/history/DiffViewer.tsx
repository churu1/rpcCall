import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface HistoryDetail {
  id: number;
  timestamp: string;
  address: string;
  serviceName: string;
  methodName: string;
  statusCode: string;
  elapsedMs: number;
  error?: string;
  requestBody: string;
  requestMetadata: { key: string; value: string }[];
  responseBody: string;
  responseHeaders: { key: string; value: string }[];
  responseTrailers: { key: string; value: string }[];
}

interface Props {
  left: HistoryDetail;
  right: HistoryDetail;
  onClose: () => void;
}

type DiffLine = {
  type: "same" | "added" | "removed";
  content: string;
};

function computeDiff(a: string, b: string): { left: DiffLine[]; right: DiffLine[] } {
  const linesA = a.split("\n");
  const linesB = b.split("\n");
  const left: DiffLine[] = [];
  const right: DiffLine[] = [];

  const max = Math.max(linesA.length, linesB.length);
  const lcsTable: number[][] = [];
  for (let i = 0; i <= linesA.length; i++) {
    lcsTable[i] = [];
    for (let j = 0; j <= linesB.length; j++) {
      if (i === 0 || j === 0) lcsTable[i][j] = 0;
      else if (linesA[i - 1] === linesB[j - 1]) lcsTable[i][j] = lcsTable[i - 1][j - 1] + 1;
      else lcsTable[i][j] = Math.max(lcsTable[i - 1][j], lcsTable[i][j - 1]);
    }
  }

  if (max > 500) {
    for (let i = 0; i < max; i++) {
      const la = i < linesA.length ? linesA[i] : undefined;
      const lb = i < linesB.length ? linesB[i] : undefined;
      if (la === lb) {
        left.push({ type: "same", content: la! });
        right.push({ type: "same", content: lb! });
      } else {
        if (la !== undefined) left.push({ type: "removed", content: la });
        else left.push({ type: "same", content: "" });
        if (lb !== undefined) right.push({ type: "added", content: lb });
        else right.push({ type: "same", content: "" });
      }
    }
    return { left, right };
  }

  let i = linesA.length;
  let j = linesB.length;
  const ops: Array<{ type: "same" | "remove" | "add"; lineA?: string; lineB?: string }> = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && linesA[i - 1] === linesB[j - 1]) {
      ops.push({ type: "same", lineA: linesA[i - 1], lineB: linesB[j - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || lcsTable[i][j - 1] >= lcsTable[i - 1][j])) {
      ops.push({ type: "add", lineB: linesB[j - 1] });
      j--;
    } else {
      ops.push({ type: "remove", lineA: linesA[i - 1] });
      i--;
    }
  }
  ops.reverse();

  for (const op of ops) {
    if (op.type === "same") {
      left.push({ type: "same", content: op.lineA! });
      right.push({ type: "same", content: op.lineB! });
    } else if (op.type === "remove") {
      left.push({ type: "removed", content: op.lineA! });
      right.push({ type: "same", content: "" });
    } else {
      left.push({ type: "same", content: "" });
      right.push({ type: "added", content: op.lineB! });
    }
  }

  return { left, right };
}

function formatMetadata(entries: { key: string; value: string }[]): string {
  if (!entries || entries.length === 0) return "{}";
  const obj: Record<string, string> = {};
  entries.forEach((e) => { obj[e.key] = e.value; });
  return JSON.stringify(obj, null, 2);
}

type TabKey = "request" | "response" | "metadata";

export function DiffViewer({ left, right, onClose }: Props) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabKey>("request");

  const { leftText, rightText } = useMemo(() => {
    switch (activeTab) {
      case "request":
        return { leftText: left.requestBody || "{}", rightText: right.requestBody || "{}" };
      case "response":
        return { leftText: left.responseBody || "", rightText: right.responseBody || "" };
      case "metadata":
        return {
          leftText: formatMetadata(left.requestMetadata),
          rightText: formatMetadata(right.requestMetadata),
        };
    }
  }, [activeTab, left, right]);

  const diff = useMemo(() => computeDiff(leftText, rightText), [leftText, rightText]);

  const tabs: { key: TabKey; label: string }[] = [
    { key: "request", label: t("history.request") },
    { key: "response", label: t("history.response") },
    { key: "metadata", label: t("panels.metadata") },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-[var(--color-card)] border rounded-lg shadow-xl w-[90vw] max-w-[1000px] max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-4">
            <h3 className="text-sm font-medium">{t("history.diff")}</h3>
            <div className="flex gap-1">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    "px-2 py-1 text-xs rounded transition-colors",
                    activeTab === tab.key
                      ? "bg-[var(--color-primary)] text-white"
                      : "text-[var(--color-muted-foreground)] hover:bg-[var(--color-secondary)]"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-[var(--color-secondary)] rounded">
            <X size={14} />
          </button>
        </div>

        <div className="flex border-b text-[10px] text-[var(--color-muted-foreground)]">
          <div className="flex-1 px-3 py-1.5 border-r truncate">
            #{left.id} — {left.serviceName}/{left.methodName} ({left.statusCode}, {left.elapsedMs}ms)
          </div>
          <div className="flex-1 px-3 py-1.5 truncate">
            #{right.id} — {right.serviceName}/{right.methodName} ({right.statusCode}, {right.elapsedMs}ms)
          </div>
        </div>

        <div className="flex flex-1 min-h-0 overflow-auto">
          <div className="flex-1 border-r overflow-auto">
            <pre className="text-[11px] font-mono p-2 leading-5">
              {diff.left.map((line, i) => (
                <div
                  key={i}
                  className={cn(
                    "px-1 -mx-1",
                    line.type === "removed" && "bg-red-500/15 text-red-400",
                    line.content === "" && line.type === "same" && "h-5"
                  )}
                >
                  {line.content || "\u00A0"}
                </div>
              ))}
            </pre>
          </div>
          <div className="flex-1 overflow-auto">
            <pre className="text-[11px] font-mono p-2 leading-5">
              {diff.right.map((line, i) => (
                <div
                  key={i}
                  className={cn(
                    "px-1 -mx-1",
                    line.type === "added" && "bg-green-500/15 text-green-400",
                    line.content === "" && line.type === "same" && "h-5"
                  )}
                >
                  {line.content || "\u00A0"}
                </div>
              ))}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
