import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { IconButton } from "@/components/ui/IconButton";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Button } from "@/components/ui/Button";

interface Props {
  left: BenchmarkHistoryEntry;
  right: BenchmarkHistoryEntry;
  onClose: () => void;
}

interface MetricRow {
  label: string;
  a: number;
  b: number;
  unit?: string;
  higherIsBetter: boolean;
  format: (v: number) => string;
}

function fmt(v: number, digits = 1): string {
  if (!Number.isFinite(v)) return "-";
  return v.toFixed(digits);
}

function deltaText(a: number, b: number): string {
  const d = b - a;
  if (!Number.isFinite(d)) return "-";
  const sign = d > 0 ? "+" : "";
  return `${sign}${fmt(d)}`;
}

function pctText(a: number, b: number): string {
  if (a === 0 || !Number.isFinite(a)) return "";
  const pct = ((b - a) / Math.abs(a)) * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${fmt(pct)}%`;
}

export function BenchmarkCompareDialog({ left, right, onClose }: Props) {
  const { t } = useTranslation();
  const a = left.result;
  const b = right.result;

  const rows: MetricRow[] = useMemo(
    () => [
      { label: "QPS", a: a.currentQps, b: b.currentQps, higherIsBetter: true, format: (v) => fmt(v) },
      { label: t("benchmark.avgLatency"), a: a.avgLatencyMs, b: b.avgLatencyMs, unit: "ms", higherIsBetter: false, format: (v) => fmt(v) },
      { label: "P50", a: a.p50Ms, b: b.p50Ms, unit: "ms", higherIsBetter: false, format: (v) => fmt(v) },
      { label: "P90", a: a.p90Ms, b: b.p90Ms, unit: "ms", higherIsBetter: false, format: (v) => fmt(v) },
      { label: "P99", a: a.p99Ms, b: b.p99Ms, unit: "ms", higherIsBetter: false, format: (v) => fmt(v) },
      { label: t("benchmark.min"), a: a.minLatencyMs, b: b.minLatencyMs, unit: "ms", higherIsBetter: false, format: (v) => fmt(v) },
      { label: t("benchmark.max"), a: a.maxLatencyMs, b: b.maxLatencyMs, unit: "ms", higherIsBetter: false, format: (v) => fmt(v) },
      {
        label: t("benchmark.successRate"),
        a: a.totalSent > 0 ? (a.totalSuccess / a.totalSent) * 100 : 0,
        b: b.totalSent > 0 ? (b.totalSuccess / b.totalSent) * 100 : 0,
        unit: "%",
        higherIsBetter: true,
        format: (v) => fmt(v),
      },
      { label: t("benchmark.totalSent"), a: a.totalSent, b: b.totalSent, higherIsBetter: true, format: (v) => String(v) },
      { label: t("benchmark.errorCount"), a: a.totalError, b: b.totalError, higherIsBetter: false, format: (v) => String(v) },
    ],
    [a, b, t]
  );

  const mergedBuckets = useMemo(() => {
    const labels: string[] = [];
    const seen = new Set<string>();
    for (const bucket of [...(a.latencyBuckets ?? []), ...(b.latencyBuckets ?? [])]) {
      if (!seen.has(bucket.labelMs)) {
        seen.add(bucket.labelMs);
        labels.push(bucket.labelMs);
      }
    }
    return labels;
  }, [a, b]);

  const maxBucketCount = Math.max(
    ...(a.latencyBuckets ?? []).map((x) => x.count),
    ...(b.latencyBuckets ?? []).map((x) => x.count),
    1
  );

  const configRows = useMemo(() => {
    const ca = left.config;
    const cb = right.config;
    return [
      { label: t("benchmark.mode"), a: ca.mode, b: cb.mode },
      { label: t("benchmark.concurrency"), a: String(ca.concurrency), b: String(cb.concurrency) },
      { label: t("benchmark.totalRequests"), a: String(ca.totalRequests), b: String(cb.totalRequests) },
      { label: t("benchmark.duration"), a: String(ca.durationSec), b: String(cb.durationSec) },
      { label: t("benchmark.targetQps"), a: String(ca.targetQps ?? 0), b: String(cb.targetQps ?? 0) },
      { label: t("benchmark.rampUp"), a: String(ca.rampUpEnabled ? `${ca.rampUpStepSec}s+${ca.rampUpStepAdd}` : "off"), b: String(cb.rampUpEnabled ? `${cb.rampUpStepSec}s+${cb.rampUpStepAdd}` : "off") },
    ];
  }, [left.config, right.config, t]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <Card className="w-[760px] max-w-[92vw] max-h-[88vh] flex flex-col p-0 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <SectionHeader
          title={t("benchmark.compareTitle")}
          className="h-11 px-3 text-xs"
          right={
            <IconButton onClick={onClose} size="sm" title={t("common.close")} aria-label={t("common.close")}>
              <X size={14} />
            </IconButton>
          }
        />
        <div className="overflow-auto flex-1 p-3 flex flex-col gap-3 text-xs">
          {/* Meta info */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded border border-[var(--line-soft)] p-2 bg-[var(--surface-1)]">
              <div className="text-[10px] text-[var(--text-muted)] mb-0.5">A · {new Date(left.createdAt).toLocaleString()}</div>
              <div className="font-medium">{left.serviceName}/{left.methodName}</div>
              <div className="text-[10px] text-[var(--text-muted)] truncate">{left.address}</div>
            </div>
            <div className="rounded border border-[var(--line-soft)] p-2 bg-[var(--surface-1)]">
              <div className="text-[10px] text-[var(--text-muted)] mb-0.5">B · {new Date(right.createdAt).toLocaleString()}</div>
              <div className="font-medium">{right.serviceName}/{right.methodName}</div>
              <div className="text-[10px] text-[var(--text-muted)] truncate">{right.address}</div>
            </div>
          </div>

          {/* Metric table */}
          <div className="rounded border border-[var(--line-soft)] overflow-hidden">
            <div className="grid grid-cols-[1fr_auto_auto_auto] bg-[var(--surface-2)] text-[10px] font-medium text-[var(--text-muted)] px-2 py-1">
              <span>{t("benchmark.metric")}</span>
              <span className="w-20 text-right">A</span>
              <span className="w-20 text-right">B</span>
              <span className="w-28 text-right">{t("benchmark.delta")}</span>
            </div>
            {rows.map((row) => {
              const d = row.b - row.a;
              const isBetter = row.higherIsBetter ? d > 0 : d < 0;
              const isWorse = row.higherIsBetter ? d < 0 : d > 0;
              const colorClass = isBetter ? "text-[var(--color-method-unary)]" : isWorse ? "text-[var(--state-error)]" : "text-[var(--text-muted)]";
              return (
                <div key={row.label} className="grid grid-cols-[1fr_auto_auto_auto] px-2 py-1 border-t border-[var(--line-soft)]">
                  <span className="text-[var(--text-normal)]">{row.label}</span>
                  <span className="w-20 text-right text-[var(--text-muted)] font-mono">{row.format(row.a)}{row.unit ?? ""}</span>
                  <span className="w-20 text-right text-[var(--text-normal)] font-mono">{row.format(row.b)}{row.unit ?? ""}</span>
                  <span className={`w-28 text-right font-mono ${colorClass}`}>
                    {deltaText(row.a, row.b)}{row.unit ?? ""} <span className="opacity-70">({pctText(row.a, row.b)})</span>
                  </span>
                </div>
              );
            })}
          </div>

          {/* Latency histogram compare */}
          {mergedBuckets.length > 0 && (
            <div>
              <div className="text-[10px] font-medium text-[var(--text-muted)] mb-1">{t("benchmark.latencyDist")}</div>
              <div className="flex items-end gap-1 h-[80px] border-b border-[var(--line-soft)] pb-0">
                {mergedBuckets.map((label) => {
                  const av = a.latencyBuckets?.find((x) => x.labelMs === label)?.count ?? 0;
                  const bv = b.latencyBuckets?.find((x) => x.labelMs === label)?.count ?? 0;
                  const ah = (av / maxBucketCount) * 70;
                  const bh = (bv / maxBucketCount) * 70;
                  return (
                    <div key={label} className="flex-1 flex flex-col items-center gap-0.5 min-w-0">
                      <div className="flex items-end gap-0.5 h-[70px]">
                        <div className="w-2 bg-[var(--state-info)] rounded-t" style={{ height: `${ah}px` }} title={`A: ${av}`} />
                        <div className="w-2 bg-[var(--color-method-unary)] rounded-t" style={{ height: `${bh}px` }} title={`B: ${bv}`} />
                      </div>
                      <span className="text-[8px] text-[var(--text-muted)] truncate w-full text-center" title={label}>{label}</span>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center gap-3 mt-1 text-[9px] text-[var(--text-muted)]">
                <span className="flex items-center gap-1"><span className="w-2 h-2 bg-[var(--state-info)] rounded-sm" />A</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 bg-[var(--color-method-unary)] rounded-sm" />B</span>
              </div>
            </div>
          )}

          {/* Config compare */}
          <div>
            <div className="text-[10px] font-medium text-[var(--text-muted)] mb-1">{t("benchmark.configCompare")}</div>
            <div className="rounded border border-[var(--line-soft)] overflow-hidden">
              {configRows.map((row) => {
                const mismatch = row.a !== row.b;
                return (
                  <div key={row.label} className={`grid grid-cols-[1fr_auto_auto] px-2 py-1 border-t border-[var(--line-soft)] first:border-t-0 ${mismatch ? "bg-[var(--state-error)]/8" : ""}`}>
                    <span className="text-[var(--text-normal)]">{row.label}</span>
                    <span className="w-24 text-right font-mono text-[var(--text-muted)]">{row.a}</span>
                    <span className={`w-24 text-right font-mono ${mismatch ? "text-[var(--state-error)]" : "text-[var(--text-normal)]"}`}>{row.b}</span>
                  </div>
                );
              })}
            </div>
            {configRows.some((r) => r.a !== r.b) && (
              <div className="text-[10px] text-[var(--state-error)] mt-1">{t("benchmark.configMismatch")}</div>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 px-3 py-2 border-t border-[var(--line-soft)]">
          <Button onClick={onClose} variant="ghost">{t("common.close")}</Button>
        </div>
      </Card>
    </div>
  );
}
