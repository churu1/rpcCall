import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/Card";
import { IconButton } from "@/components/ui/IconButton";
import { PanelTabs } from "@/components/ui/PanelTabs";
import { SectionHeader } from "@/components/ui/SectionHeader";

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
      <Card
        className="w-[92vw] max-w-[1060px] max-h-[82vh] flex flex-col p-0 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <SectionHeader
          title={t("history.diff")}
          className="h-11 px-3 text-xs"
          right={(
            <IconButton onClick={onClose} size="sm" title={t("common.close")} aria-label={t("common.close")}>
              <X size={14} />
            </IconButton>
          )}
        />
        <PanelTabs tabs={tabs} active={activeTab} onChange={setActiveTab} className="border-b border-[var(--line-soft)] px-2" />

        <div className="flex border-b border-[var(--line-soft)] text-[10px] text-[var(--text-muted)]">
          <div className="flex-1 px-3 py-1.5 border-r border-[var(--line-soft)] truncate">
            #{left.id} — {left.serviceName}/{left.methodName} ({left.statusCode}, {left.elapsedMs}ms)
          </div>
          <div className="flex-1 px-3 py-1.5 truncate">
            #{right.id} — {right.serviceName}/{right.methodName} ({right.statusCode}, {right.elapsedMs}ms)
          </div>
        </div>

        <div className="flex flex-1 min-h-0 overflow-auto">
          <div className="flex-1 border-r border-[var(--line-soft)] overflow-auto">
            <pre className="text-[11px] text-[var(--text-normal)] font-mono p-2 leading-5">
              {diff.left.map((line, i) => (
                <div
                  key={i}
                  className={cn(
                    "px-1 -mx-1",
                    line.type === "removed" && "bg-[var(--state-error)]/14 text-[var(--state-error)]",
                    line.content === "" && line.type === "same" && "h-5"
                  )}
                >
                  {line.content || "\u00A0"}
                </div>
              ))}
            </pre>
          </div>
          <div className="flex-1 overflow-auto">
            <pre className="text-[11px] text-[var(--text-normal)] font-mono p-2 leading-5">
              {diff.right.map((line, i) => (
                <div
                  key={i}
                  className={cn(
                    "px-1 -mx-1",
                    line.type === "added" && "bg-[var(--state-success)]/14 text-[var(--state-success)]",
                    line.content === "" && line.type === "same" && "h-5"
                  )}
                >
                  {line.content || "\u00A0"}
                </div>
              ))}
            </pre>
          </div>
        </div>
      </Card>
    </div>
  );
}
