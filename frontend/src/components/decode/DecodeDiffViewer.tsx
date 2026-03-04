import { useMemo } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/Card";
import { IconButton } from "@/components/ui/IconButton";
import { SectionHeader } from "@/components/ui/SectionHeader";

interface Props {
  leftTitle: string;
  rightTitle: string;
  leftText: string;
  rightText: string;
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

  const lcs: number[][] = [];
  for (let i = 0; i <= linesA.length; i++) {
    lcs[i] = [];
    for (let j = 0; j <= linesB.length; j++) {
      if (i === 0 || j === 0) lcs[i][j] = 0;
      else if (linesA[i - 1] === linesB[j - 1]) lcs[i][j] = lcs[i - 1][j - 1] + 1;
      else lcs[i][j] = Math.max(lcs[i - 1][j], lcs[i][j - 1]);
    }
  }

  let i = linesA.length;
  let j = linesB.length;
  const ops: Array<{ t: "same" | "add" | "remove"; la?: string; lb?: string }> = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && linesA[i - 1] === linesB[j - 1]) {
      ops.push({ t: "same", la: linesA[i - 1], lb: linesB[j - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || lcs[i][j - 1] >= lcs[i - 1][j])) {
      ops.push({ t: "add", lb: linesB[j - 1] });
      j--;
    } else {
      ops.push({ t: "remove", la: linesA[i - 1] });
      i--;
    }
  }
  ops.reverse();

  for (const op of ops) {
    if (op.t === "same") {
      left.push({ type: "same", content: op.la || "" });
      right.push({ type: "same", content: op.lb || "" });
    } else if (op.t === "remove") {
      left.push({ type: "removed", content: op.la || "" });
      right.push({ type: "same", content: "" });
    } else {
      left.push({ type: "same", content: "" });
      right.push({ type: "added", content: op.lb || "" });
    }
  }
  return { left, right };
}

export function DecodeDiffViewer({ leftTitle, rightTitle, leftText, rightText, onClose }: Props) {
  const { t } = useTranslation();
  const diff = useMemo(() => computeDiff(leftText, rightText), [leftText, rightText]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <Card
        className="w-[92vw] max-w-[1100px] max-h-[82vh] flex flex-col p-0 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <SectionHeader
          title={t("decode.diffTitle")}
          className="h-11 px-3 text-xs"
          right={(
            <IconButton onClick={onClose} size="sm" title={t("common.close")} aria-label={t("common.close")}>
              <X size={14} />
            </IconButton>
          )}
        />
        <div className="flex border-b border-[var(--line-soft)] text-[10px] text-[var(--text-muted)]">
          <div className="flex-1 px-3 py-1.5 border-r border-[var(--line-soft)] truncate">{leftTitle}</div>
          <div className="flex-1 px-3 py-1.5 truncate">{rightTitle}</div>
        </div>
        <div className="flex flex-1 min-h-0 overflow-auto">
          <div className="flex-1 border-r border-[var(--line-soft)] overflow-auto">
            <pre className="text-[11px] text-[var(--text-normal)] font-mono p-2 leading-5">
              {diff.left.map((line, idx) => (
                <div
                  key={idx}
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
              {diff.right.map((line, idx) => (
                <div
                  key={idx}
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
