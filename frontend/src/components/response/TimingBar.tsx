import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react";

interface Props {
  timing: TimingDetail;
}

const phases = [
  { key: "connectMs" as const, i18n: "timing.connect", color: "var(--state-info)" },
  { key: "serializeMs" as const, i18n: "timing.serialize", color: "var(--state-success)" },
  { key: "rpcMs" as const, i18n: "timing.rpc", color: "var(--state-warn)" },
];

const dotColors = ["var(--state-info)", "var(--state-success)", "var(--state-warn)"];

export function TimingBar({ timing }: Props) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const total = timing.totalMs || 1;
  const visiblePhases = phases.filter((p) => (timing[p.key] ?? 0) > 0.01);

  return (
    <div className="border-b border-[var(--line-soft)]">
      <button
        className="w-full flex items-center gap-2 px-3 py-1 hover:bg-[var(--surface-1)] transition-colors text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <ChevronRight
          size={12}
          className={`text-[var(--text-muted)] transition-transform shrink-0 ${expanded ? "rotate-90" : ""}`}
        />
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          {dotColors.map((c, i) => (
            <div key={i} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c }} />
          ))}
          <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1">
            {t("timing.total")}: {timing.totalMs.toFixed(2)}ms
          </span>
        </div>
      </button>
      {expanded && (
        <div className="px-3 pb-2 pt-1">
          <div className="flex h-4 rounded overflow-hidden mb-1.5 bg-[var(--surface-1)]">
            {visiblePhases.map((phase) => {
              const val = timing[phase.key] ?? 0;
              const pct = (val / total) * 100;
              return (
                <div
                  key={phase.key}
                  className="opacity-85 hover:opacity-100 transition-opacity relative group"
                  style={{ width: `${Math.max(pct, 1)}%`, backgroundColor: phase.color }}
                  title={`${t(phase.i18n)}: ${val.toFixed(2)}ms`}
                >
                  <div className="absolute inset-0 flex items-center justify-center">
                    {pct > 12 && (
                      <span className="text-[8px] text-white font-mono font-medium">
                        {val.toFixed(1)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {visiblePhases.map((phase) => {
              const val = timing[phase.key] ?? 0;
              return (
                <div key={phase.key} className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: phase.color }} />
                  <span className="text-[10px] text-[var(--text-muted)] font-mono">
                    {t(phase.i18n)}: {val.toFixed(2)}ms
                  </span>
                </div>
              );
            })}
            <span className="text-[10px] text-[var(--text-strong)] font-mono font-medium ml-auto">
              {t("timing.total")}: {timing.totalMs.toFixed(2)}ms
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
