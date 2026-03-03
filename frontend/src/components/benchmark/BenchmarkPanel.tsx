import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "@/store/app-store";
import { Play, Square, Download, RotateCcw, History } from "lucide-react";
import { VariableConfig } from "./VariableConfig";
import { BenchmarkChart, MetricCards } from "./BenchmarkChart";
import { BenchmarkHistory } from "./BenchmarkHistory";

type BenchmarkStatus = "idle" | "running" | "done";

function defaultConfig(): BenchmarkConfig {
  return {
    mode: "count",
    concurrency: 10,
    totalRequests: 1000,
    durationSec: 30,
    targetQps: 100,
    rampUpEnabled: false,
    rampUpStepSec: 5,
    rampUpStepAdd: 2,
    variables: [],
  };
}

export function BenchmarkPanel() {
  const { t } = useTranslation();
  const { activeTabId, tabs } = useAppStore();
  const tab = tabs.find((t) => t.id === activeTabId);

  const [config, setConfig] = useState<BenchmarkConfig>(defaultConfig);
  const [status, setStatus] = useState<BenchmarkStatus>("idle");
  const [progressHistory, setProgressHistory] = useState<BenchmarkProgress[]>([]);
  const [result, setResult] = useState<BenchmarkResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(600);

  useEffect(() => {
    const el = chartContainerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setChartWidth(Math.max(300, entry.contentRect.width - 16));
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!window.runtime) return;

    const offProgress = window.runtime.EventsOn("benchmark:progress", (data: BenchmarkProgress) => {
      setProgressHistory((prev) => [...prev, data]);
    });

    const offDone = window.runtime.EventsOn("benchmark:done", (data: BenchmarkResult) => {
      setResult(data);
      setStatus("done");
    });

    const offError = window.runtime.EventsOn("benchmark:error", (msg: string) => {
      setError(msg);
      setStatus("idle");
    });

    return () => {
      offProgress?.();
      offDone?.();
      offError?.();
    };
  }, []);

  // Listen for command palette events
  useEffect(() => {
    const handleStart = () => {
      if (status === "idle") handleStart_();
    };
    const handleStop = () => {
      if (status === "running") handleStop_();
    };
    document.addEventListener("rpccall:start-benchmark", handleStart);
    document.addEventListener("rpccall:stop-benchmark", handleStop);
    return () => {
      document.removeEventListener("rpccall:start-benchmark", handleStart);
      document.removeEventListener("rpccall:stop-benchmark", handleStop);
    };
  });

  const handleStart_ = useCallback(async () => {
    if (!tab || !tab.method || !tab.projectId) {
      setError(t("benchmark.selectMethod"));
      return;
    }

    setError(null);
    setProgressHistory([]);
    setResult(null);
    setStatus("running");

    const req: GrpcRequest = {
      projectId: tab.projectId,
      address: tab.address,
      serviceName: tab.method.serviceName,
      methodName: tab.method.methodName,
      body: tab.requestBody,
      metadata: tab.metadata
        .filter((m) => m.enabled && m.key)
        .map((m) => ({ key: m.key, value: m.value })),
      useTls: tab.useTls,
      certPath: tab.certPath,
      keyPath: tab.keyPath,
      caPath: tab.caPath,
      timeoutSec: tab.timeoutSec,
    };

    try {
      await window.go.main.App.StartBenchmark(req, config);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("idle");
    }
  }, [tab, config]);

  const handleStop_ = useCallback(async () => {
    try {
      await window.go.main.App.StopBenchmark();
    } catch {
      // ignore
    }
  }, []);

  const handleExport = useCallback(
    async (format: "json" | "csv" | "html") => {
      if (!result) return;
      try {
        let path: string;
        if (format === "html") {
          path = await window.go.main.App.ExportBenchmarkHTML(result);
        } else {
          path = await window.go.main.App.ExportBenchmarkResult(result, format);
        }
        if (path) setError(null);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [result]
  );

  const latestProgress =
    progressHistory.length > 0 ? progressHistory[progressHistory.length - 1] : null;

  if (!tab) return null;

  // --- Config Form ---
  if (status === "idle") {
    return (
      <div className="flex flex-col gap-3 p-3 text-xs">
        {error && (
          <div className="px-2 py-1.5 rounded bg-[var(--color-destructive)]/10 text-[var(--color-destructive)] text-[11px]">
            {error}
          </div>
        )}

        {/* Mode */}
        <div className="flex items-center gap-3">
          <label className="text-[11px] text-[var(--color-muted-foreground)] w-16 shrink-0">{t("benchmark.mode")}</label>
          <div className="flex gap-2">
            {(["count", "duration", "qps"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setConfig((c) => ({ ...c, mode: m }))}
                className={`px-3 py-1 rounded text-[11px] border transition-colors ${
                  config.mode === m
                    ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-foreground)]"
                    : "border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:border-[var(--color-muted-foreground)]"
                }`}
              >
                {m === "count" ? t("benchmark.byCount") : m === "duration" ? t("benchmark.byDuration") : t("benchmark.byQps")}
              </button>
            ))}
          </div>
        </div>

        {/* Concurrency */}
        {config.mode !== "qps" && (
          <div className="flex items-center gap-3">
            <label className="text-[11px] text-[var(--color-muted-foreground)] w-16 shrink-0">{t("benchmark.concurrency")}</label>
            <input
              type="number"
              min={1}
              max={10000}
              value={config.concurrency}
              onChange={(e) => setConfig((c) => ({ ...c, concurrency: Math.max(1, Number(e.target.value)) }))}
              className="w-24 bg-[var(--color-secondary)] px-2 py-1 rounded border border-[var(--color-input)] focus:outline-none focus:ring-1 focus:ring-[var(--color-ring)]"
            />
          </div>
        )}

        {/* Count / Duration / QPS */}
        {config.mode === "count" && (
          <div className="flex items-center gap-3">
            <label className="text-[11px] text-[var(--color-muted-foreground)] w-16 shrink-0">{t("benchmark.totalRequests")}</label>
            <input
              type="number"
              min={1}
              value={config.totalRequests}
              onChange={(e) => setConfig((c) => ({ ...c, totalRequests: Math.max(1, Number(e.target.value)) }))}
              className="w-24 bg-[var(--color-secondary)] px-2 py-1 rounded border border-[var(--color-input)] focus:outline-none focus:ring-1 focus:ring-[var(--color-ring)]"
            />
          </div>
        )}
        {config.mode === "duration" && (
          <div className="flex items-center gap-3">
            <label className="text-[11px] text-[var(--color-muted-foreground)] w-16 shrink-0">{t("benchmark.duration")}</label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={1}
                value={config.durationSec}
                onChange={(e) => setConfig((c) => ({ ...c, durationSec: Math.max(1, Number(e.target.value)) }))}
                className="w-24 bg-[var(--color-secondary)] px-2 py-1 rounded border border-[var(--color-input)] focus:outline-none focus:ring-1 focus:ring-[var(--color-ring)]"
              />
              <span className="text-[var(--color-muted-foreground)]">{t("benchmark.seconds")}</span>
            </div>
          </div>
        )}
        {config.mode === "qps" && (
          <>
            <div className="flex items-center gap-3">
              <label className="text-[11px] text-[var(--color-muted-foreground)] w-16 shrink-0">{t("benchmark.targetQps")}</label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={1}
                  value={config.targetQps}
                  onChange={(e) => setConfig((c) => ({ ...c, targetQps: Math.max(1, Number(e.target.value)) }))}
                  className="w-24 bg-[var(--color-secondary)] px-2 py-1 rounded border border-[var(--color-input)] focus:outline-none focus:ring-1 focus:ring-[var(--color-ring)]"
                />
                <span className="text-[var(--color-muted-foreground)]">req/s</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-[11px] text-[var(--color-muted-foreground)] w-16 shrink-0">{t("benchmark.duration")}</label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={1}
                  value={config.durationSec}
                  onChange={(e) => setConfig((c) => ({ ...c, durationSec: Math.max(1, Number(e.target.value)) }))}
                  className="w-24 bg-[var(--color-secondary)] px-2 py-1 rounded border border-[var(--color-input)] focus:outline-none focus:ring-1 focus:ring-[var(--color-ring)]"
                />
                <span className="text-[var(--color-muted-foreground)]">{t("benchmark.seconds")}</span>
              </div>
            </div>
          </>
        )}

        {/* Ramp-up */}
        <div className="flex flex-col gap-2 p-2 rounded border border-[var(--color-border)]">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={config.rampUpEnabled}
              onChange={(e) => setConfig((c) => ({ ...c, rampUpEnabled: e.target.checked }))}
            />
            <span className="text-[11px] text-[var(--color-muted-foreground)]">{t("benchmark.rampUp")}</span>
          </label>
          {config.rampUpEnabled && (
            <div className="flex items-center gap-2 ml-5">
              <span className="text-[10px] text-[var(--color-muted-foreground)]">{t("benchmark.every")}</span>
              <input
                type="number"
                min={1}
                value={config.rampUpStepSec}
                onChange={(e) => setConfig((c) => ({ ...c, rampUpStepSec: Math.max(1, Number(e.target.value)) }))}
                className="w-16 bg-[var(--color-secondary)] px-2 py-0.5 rounded border border-[var(--color-input)] focus:outline-none focus:ring-1 focus:ring-[var(--color-ring)] text-[11px]"
              />
              <span className="text-[10px] text-[var(--color-muted-foreground)]">{t("benchmark.secIncrease")}</span>
              <input
                type="number"
                min={1}
                value={config.rampUpStepAdd}
                onChange={(e) => setConfig((c) => ({ ...c, rampUpStepAdd: Math.max(1, Number(e.target.value)) }))}
                className="w-16 bg-[var(--color-secondary)] px-2 py-0.5 rounded border border-[var(--color-input)] focus:outline-none focus:ring-1 focus:ring-[var(--color-ring)] text-[11px]"
              />
              <span className="text-[10px] text-[var(--color-muted-foreground)]">{t("benchmark.concurrencyUnit")}</span>
            </div>
          )}
        </div>

        {/* Variables */}
        <VariableConfig
          variables={config.variables}
          onChange={(variables) => setConfig((c) => ({ ...c, variables }))}
        />

        {/* Start button */}
        <button
          onClick={handleStart_}
          className="flex items-center justify-center gap-2 mt-2 px-4 py-2 rounded bg-[var(--color-primary)] text-white text-xs font-medium hover:bg-[var(--color-primary)]/80 transition-colors"
        >
          <Play size={14} /> {t("benchmark.start")}
        </button>
        <button
          onClick={() => setShowHistory(true)}
          className="flex items-center justify-center gap-2 px-4 py-2 rounded border border-[var(--color-border)] text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-secondary)] transition-colors"
        >
          <History size={14} /> {t("benchmark.history")}
        </button>
        {showHistory && (
          <BenchmarkHistory
            onClose={() => setShowHistory(false)}
            onLoadResult={(r) => {
              setResult(r);
              setStatus("done");
            }}
          />
        )}
      </div>
    );
  }

  // --- Running ---
  if (status === "running") {
    return (
      <div className="flex flex-col gap-3 p-3" ref={chartContainerRef}>
        {latestProgress && <MetricCards progress={latestProgress} />}

        <BenchmarkChart history={progressHistory} width={chartWidth} height={180} />

        <button
          onClick={handleStop_}
          className="flex items-center justify-center gap-2 px-4 py-2 rounded bg-[var(--color-destructive)] text-white text-xs font-medium hover:bg-[var(--color-destructive)]/80 transition-colors self-center"
        >
          <Square size={14} /> {t("benchmark.stop")}
        </button>
      </div>
    );
  }

  // --- Done ---
  return (
    <div className="flex flex-col gap-3 p-3" ref={chartContainerRef}>
      {error && (
        <div className="px-2 py-1.5 rounded bg-[var(--color-destructive)]/10 text-[var(--color-destructive)] text-[11px]">
          {error}
        </div>
      )}

      {result && (
        <>
          {/* Summary */}
          <div className="text-[11px] font-medium text-[var(--color-muted-foreground)]">{t("benchmark.summary")}</div>
          <MetricCards progress={result} />

          {/* Latency distribution */}
          <div className="text-[11px] font-medium text-[var(--color-muted-foreground)] mt-2">{t("benchmark.latencyDist")}</div>
          <div className="grid grid-cols-5 gap-2 text-[11px]">
            <div className="flex flex-col items-center">
              <span className="text-[var(--color-muted-foreground)]">{t("benchmark.min")}</span>
              <span className="font-mono">{result.minLatencyMs.toFixed(1)}ms</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-[var(--color-muted-foreground)]">{t("benchmark.p50")}</span>
              <span className="font-mono">{result.p50Ms.toFixed(1)}ms</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-[var(--color-muted-foreground)]">{t("benchmark.p90")}</span>
              <span className="font-mono">{result.p90Ms.toFixed(1)}ms</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-[var(--color-muted-foreground)]">{t("benchmark.p99")}</span>
              <span className="font-mono">{result.p99Ms.toFixed(1)}ms</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-[var(--color-muted-foreground)]">{t("benchmark.max")}</span>
              <span className="font-mono">{result.maxLatencyMs.toFixed(1)}ms</span>
            </div>
          </div>

          {/* Histogram */}
          {result.latencyBuckets && result.latencyBuckets.length > 0 && (
            <LatencyHistogram buckets={result.latencyBuckets} width={chartWidth} />
          )}

          {/* QPS / Latency chart over time */}
          {progressHistory.length > 1 && (
            <>
              <div className="text-[11px] font-medium text-[var(--color-muted-foreground)] mt-2">
                {t("benchmark.qpsTrend")}
              </div>
              <BenchmarkChart history={progressHistory} width={chartWidth} height={160} />
            </>
          )}

          {/* Error codes */}
          {result.errorCodes && Object.keys(result.errorCodes).length > 0 && (
            <>
              <div className="text-[11px] font-medium text-[var(--color-muted-foreground)] mt-2">
                {t("benchmark.errorCodes")}
              </div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(result.errorCodes).map(([code, count]) => (
                  <div
                    key={code}
                    className="flex items-center gap-1.5 px-2 py-1 rounded bg-[var(--color-destructive)]/10 text-[11px]"
                  >
                    <span className="font-mono text-[var(--color-destructive)]">{code}</span>
                    <span className="text-[var(--color-muted-foreground)]">×{count}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={() => handleExport("json")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[var(--color-secondary)] text-xs hover:bg-[var(--color-secondary)]/80 border border-[var(--color-border)]"
            >
              <Download size={12} /> {t("benchmark.exportJson")}
            </button>
            <button
              onClick={() => handleExport("csv")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[var(--color-secondary)] text-xs hover:bg-[var(--color-secondary)]/80 border border-[var(--color-border)]"
            >
              <Download size={12} /> {t("benchmark.exportCsv")}
            </button>
            <button
              onClick={() => handleExport("html")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[var(--color-secondary)] text-xs hover:bg-[var(--color-secondary)]/80 border border-[var(--color-border)]"
            >
              <Download size={12} /> {t("benchmark.exportHtml")}
            </button>
            <button
              onClick={() => setShowHistory(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[var(--color-secondary)] text-xs hover:bg-[var(--color-secondary)]/80 border border-[var(--color-border)]"
            >
              <History size={12} /> {t("benchmark.history")}
            </button>
            <button
              onClick={() => {
                setStatus("idle");
                setResult(null);
                setProgressHistory([]);
                setError(null);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[var(--color-primary)] text-white text-xs hover:bg-[var(--color-primary)]/80"
            >
              <RotateCcw size={12} /> {t("benchmark.reset")}
            </button>
          </div>
        </>
      )}
      {showHistory && (
        <BenchmarkHistory
          onClose={() => setShowHistory(false)}
          onLoadResult={(r) => {
            setResult(r);
            setStatus("done");
          }}
        />
      )}
    </div>
  );
}

// --- Latency Histogram ---

function LatencyHistogram({
  buckets,
  width,
}: {
  buckets: LatencyBucket[];
  width: number;
}) {
  const height = 120;
  const padding = { top: 10, right: 10, bottom: 28, left: 40 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const maxCount = Math.max(...buckets.map((b) => b.count), 1);
  const barW = Math.max(4, (chartW - (buckets.length - 1) * 2) / buckets.length);

  return (
    <svg width={width} height={height} className="select-none">
      <g transform={`translate(${padding.left},${padding.top})`}>
        {buckets.map((b, i) => {
          const barH = (b.count / maxCount) * chartH;
          const x = i * (barW + 2);
          const y = chartH - barH;
          return (
            <g key={i}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={barH}
                rx={1}
                fill="var(--color-primary)"
                opacity={0.8}
              />
              {b.count > 0 && (
                <text
                  x={x + barW / 2}
                  y={y - 3}
                  textAnchor="middle"
                  fill="var(--color-muted-foreground)"
                  fontSize={8}
                >
                  {b.count}
                </text>
              )}
              <text
                x={x + barW / 2}
                y={chartH + 12}
                textAnchor="middle"
                fill="var(--color-muted-foreground)"
                fontSize={7}
                transform={`rotate(-30, ${x + barW / 2}, ${chartH + 12})`}
              >
                {b.labelMs}
              </text>
            </g>
          );
        })}
        <line x1={0} y1={chartH} x2={chartW} y2={chartH} stroke="var(--color-border)" />
      </g>
    </svg>
  );
}
