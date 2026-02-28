import { useMemo } from "react";

interface BenchmarkChartProps {
  history: BenchmarkProgress[];
  width?: number;
  height?: number;
}

export function BenchmarkChart({
  history,
  width = 600,
  height = 200,
}: BenchmarkChartProps) {
  const padding = { top: 20, right: 60, bottom: 30, left: 60 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const { qpsPath, latPath, xTicks, yQpsTicks, yLatTicks, maxQps, maxLat } =
    useMemo(() => {
      if (history.length < 2) {
        return {
          qpsPath: "",
          latPath: "",
          xTicks: [] as number[],
          yQpsTicks: [] as number[],
          yLatTicks: [] as number[],
          maxQps: 0,
          maxLat: 0,
        };
      }

      const times = history.map((h) => h.elapsedMs / 1000);
      const qpsVals = history.map((h) => h.currentQps);
      const latVals = history.map((h) => h.avgLatencyMs);

      const maxTime = Math.max(...times);
      const mQps = Math.max(...qpsVals, 1);
      const mLat = Math.max(...latVals, 1);

      const scaleX = (t: number) => (t / maxTime) * chartW;
      const scaleQps = (q: number) => chartH - (q / mQps) * chartH;
      const scaleLat = (l: number) => chartH - (l / mLat) * chartH;

      const qPath = times
        .map((t, i) => `${i === 0 ? "M" : "L"}${scaleX(t)},${scaleQps(qpsVals[i])}`)
        .join(" ");
      const lPath = times
        .map((t, i) => `${i === 0 ? "M" : "L"}${scaleX(t)},${scaleLat(latVals[i])}`)
        .join(" ");

      const numXTicks = Math.min(6, Math.floor(maxTime));
      const xStep = maxTime / Math.max(numXTicks, 1);
      const xt: number[] = [];
      for (let i = 0; i <= numXTicks; i++) {
        xt.push(Math.round(i * xStep));
      }

      const niceSteps = (max: number, count: number) => {
        const step = max / count;
        const arr: number[] = [];
        for (let i = 0; i <= count; i++) arr.push(Math.round(step * i * 10) / 10);
        return arr;
      };

      return {
        qpsPath: qPath,
        latPath: lPath,
        xTicks: xt,
        yQpsTicks: niceSteps(mQps, 4),
        yLatTicks: niceSteps(mLat, 4),
        maxQps: mQps,
        maxLat: mLat,
      };
    }, [history, chartW, chartH]);

  if (history.length < 2) {
    return (
      <div
        className="flex items-center justify-center text-xs text-[var(--color-muted-foreground)]"
        style={{ width, height }}
      >
        等待数据...
      </div>
    );
  }

  const maxTime = history[history.length - 1].elapsedMs / 1000;

  return (
    <svg width={width} height={height} className="select-none">
      <g transform={`translate(${padding.left},${padding.top})`}>
        {/* Grid lines */}
        {yQpsTicks.map((v, i) => {
          const y = chartH - (v / maxQps) * chartH;
          return (
            <line
              key={`grid-${i}`}
              x1={0}
              y1={y}
              x2={chartW}
              y2={y}
              stroke="var(--color-border)"
              strokeDasharray="3,3"
              opacity={0.5}
            />
          );
        })}

        {/* QPS line */}
        <path d={qpsPath} fill="none" stroke="#22c55e" strokeWidth={2} />
        {/* Latency line */}
        <path d={latPath} fill="none" stroke="#f59e0b" strokeWidth={2} />

        {/* X axis */}
        <line x1={0} y1={chartH} x2={chartW} y2={chartH} stroke="var(--color-border)" />
        {xTicks.map((t, i) => {
          const x = (t / maxTime) * chartW;
          return (
            <g key={`xt-${i}`}>
              <line x1={x} y1={chartH} x2={x} y2={chartH + 4} stroke="var(--color-muted-foreground)" />
              <text
                x={x}
                y={chartH + 16}
                textAnchor="middle"
                fill="var(--color-muted-foreground)"
                fontSize={9}
              >
                {t}s
              </text>
            </g>
          );
        })}

        {/* Y axis left - QPS */}
        <line x1={0} y1={0} x2={0} y2={chartH} stroke="var(--color-border)" />
        {yQpsTicks.map((v, i) => {
          const y = chartH - (v / maxQps) * chartH;
          return (
            <text
              key={`yq-${i}`}
              x={-6}
              y={y + 3}
              textAnchor="end"
              fill="#22c55e"
              fontSize={9}
            >
              {v >= 1000 ? `${(v / 1000).toFixed(1)}k` : Math.round(v)}
            </text>
          );
        })}
        <text x={-6} y={-8} textAnchor="end" fill="#22c55e" fontSize={9} fontWeight="bold">
          QPS
        </text>

        {/* Y axis right - Latency */}
        <line x1={chartW} y1={0} x2={chartW} y2={chartH} stroke="var(--color-border)" />
        {yLatTicks.map((v, i) => {
          const y = chartH - (v / maxLat) * chartH;
          return (
            <text
              key={`yl-${i}`}
              x={chartW + 6}
              y={y + 3}
              textAnchor="start"
              fill="#f59e0b"
              fontSize={9}
            >
              {Math.round(v)}ms
            </text>
          );
        })}
        <text
          x={chartW + 6}
          y={-8}
          textAnchor="start"
          fill="#f59e0b"
          fontSize={9}
          fontWeight="bold"
        >
          延迟
        </text>
      </g>

      {/* Legend */}
      <g transform={`translate(${padding.left + 10},${padding.top + 6})`}>
        <rect x={0} y={0} width={8} height={8} rx={1} fill="#22c55e" />
        <text x={12} y={7} fill="var(--color-muted-foreground)" fontSize={9}>
          QPS
        </text>
        <rect x={45} y={0} width={8} height={8} rx={1} fill="#f59e0b" />
        <text x={57} y={7} fill="var(--color-muted-foreground)" fontSize={9}>
          平均延迟
        </text>
      </g>
    </svg>
  );
}

// --- Metrics cards ---

interface MetricCardProps {
  label: string;
  value: string | number;
  unit?: string;
  color?: string;
}

function MetricCard({ label, value, unit, color }: MetricCardProps) {
  return (
    <div className="flex flex-col items-center p-2 rounded bg-[var(--color-secondary)] border border-[var(--color-border)] min-w-[80px]">
      <span className="text-[10px] text-[var(--color-muted-foreground)]">{label}</span>
      <span className="text-sm font-semibold" style={{ color: color || "var(--color-foreground)" }}>
        {typeof value === "number" ? value.toFixed(1) : value}
      </span>
      {unit && (
        <span className="text-[9px] text-[var(--color-muted-foreground)]">{unit}</span>
      )}
    </div>
  );
}

export function MetricCards({ progress }: { progress: BenchmarkProgress }) {
  const successRate =
    progress.totalSent > 0
      ? ((progress.totalSuccess / progress.totalSent) * 100).toFixed(1)
      : "0.0";

  return (
    <div className="flex flex-wrap gap-2">
      <MetricCard label="QPS" value={progress.currentQps} color="#22c55e" />
      <MetricCard label="平均延迟" value={progress.avgLatencyMs} unit="ms" color="#f59e0b" />
      <MetricCard label="P50" value={progress.p50Ms} unit="ms" />
      <MetricCard label="P90" value={progress.p90Ms} unit="ms" />
      <MetricCard label="P99" value={progress.p99Ms} unit="ms" />
      <MetricCard label="成功率" value={`${successRate}%`} color={Number(successRate) > 99 ? "#22c55e" : "#ef4444"} />
      <MetricCard label="已发送" value={progress.totalSent.toString()} />
      <MetricCard label="成功" value={progress.totalSuccess.toString()} color="#22c55e" />
      <MetricCard label="失败" value={progress.totalError.toString()} color={progress.totalError > 0 ? "#ef4444" : undefined} />
    </div>
  );
}
