import { useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "@/store/app-store";
import { Plus, Trash2, Play, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { SearchableSelect } from "@/components/ui/SearchableSelect";

interface StepConfig {
  address: string;
  serviceName: string;
  methodName: string;
  body: string;
  manualInput?: boolean;
}

export function ChainEditor() {
  const { t } = useTranslation();
  const { tabs, activeTabId, protoFiles } = useAppStore();
  const tab = tabs.find((t) => t.id === activeTabId);

  const allServices = useMemo(() => {
    return protoFiles.flatMap((f) => f.services ?? []);
  }, [protoFiles]);

  const [steps, setSteps] = useState<StepConfig[]>([
    { address: tab?.address || "localhost:50051", serviceName: tab?.method?.serviceName || "", methodName: tab?.method?.methodName || "", body: tab?.requestBody || '{\n  \n}' },
  ]);
  const [results, setResults] = useState<ChainStepResult[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedResults, setExpandedResults] = useState<Set<number>>(new Set());

  const addStep = () => {
    setSteps([...steps, { address: tab?.address || "localhost:50051", serviceName: "", methodName: "", body: '{\n  \n}', manualInput: allServices.length === 0 }]);
  };

  const removeStep = (i: number) => {
    setSteps(steps.filter((_, idx) => idx !== i));
  };

  const updateStep = (i: number, updates: Partial<StepConfig>) => {
    setSteps(steps.map((s, idx) => (idx === i ? { ...s, ...updates } : s)));
  };

  const handleServiceChange = (i: number, serviceName: string) => {
    updateStep(i, { serviceName, methodName: "", body: '{\n  \n}' });
  };

  const handleMethodChange = async (i: number, serviceName: string, methodName: string) => {
    updateStep(i, { methodName });
    if (serviceName && methodName) {
      try {
        const template = await window.go.main.App.GetMethodTemplate(serviceName, methodName);
        if (template) updateStep(i, { methodName, body: template });
      } catch { /* ignore */ }
    }
  };

  const toggleResult = (i: number) => {
    setExpandedResults((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const runChain = useCallback(async () => {
    if (steps.length === 0) return;
    setRunning(true);
    setError(null);
    setResults([]);
    try {
      const chainSteps: ChainStep[] = steps.map((s) => ({
        address: s.address,
        serviceName: s.serviceName,
        methodName: s.methodName,
        body: s.body,
        metadata: tab?.metadata?.filter((m) => m.enabled && m.key).map((m) => ({ key: m.key, value: m.value })) || [],
        useTls: tab?.useTls || false,
        certPath: tab?.certPath || "",
        keyPath: tab?.keyPath || "",
        caPath: tab?.caPath || "",
      }));
      const result = await window.go.main.App.InvokeChain(chainSteps);
      setResults(result.steps || []);
      const allExpanded = new Set<number>();
      (result.steps || []).forEach((_, i) => allExpanded.add(i));
      setExpandedResults(allExpanded);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }, [steps, tab]);

  return (
    <div className="flex flex-col gap-3 p-3 text-xs">
      <div className="text-[11px] font-medium text-[var(--color-muted-foreground)]">
        {t("chain.description")}
      </div>

      {error && (
        <div className="px-2 py-1.5 rounded bg-[var(--color-destructive)]/10 text-[var(--color-destructive)] text-[11px]">
          {error}
        </div>
      )}

      {steps.map((step, i) => (
        <div key={i} className="border border-[var(--color-border)] rounded p-2 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium text-[var(--color-primary)]">{t("chain.stepN", { n: i + 1 })}</span>
            {steps.length > 1 && (
              <button onClick={() => removeStep(i)} className="p-0.5 hover:text-[var(--color-destructive)]">
                <Trash2 size={11} />
              </button>
            )}
          </div>
          <input
            value={step.address}
            onChange={(e) => updateStep(i, { address: e.target.value })}
            placeholder={t("chain.addressPlaceholder")}
            className="w-full bg-[var(--color-secondary)] px-2 py-1 rounded border border-[var(--color-input)] focus:outline-none focus:ring-1 focus:ring-[var(--color-ring)] text-[11px]"
          />
          {step.manualInput || allServices.length === 0 ? (
            <div className="flex gap-1">
              <input
                value={step.serviceName}
                onChange={(e) => updateStep(i, { serviceName: e.target.value })}
                placeholder={t("chain.servicePlaceholder")}
                className="flex-1 bg-[var(--color-secondary)] px-2 py-1 rounded border border-[var(--color-input)] focus:outline-none focus:ring-1 focus:ring-[var(--color-ring)] text-[11px] font-mono"
              />
              <input
                value={step.methodName}
                onChange={(e) => updateStep(i, { methodName: e.target.value })}
                placeholder={t("chain.methodPlaceholder")}
                className="flex-1 bg-[var(--color-secondary)] px-2 py-1 rounded border border-[var(--color-input)] focus:outline-none focus:ring-1 focus:ring-[var(--color-ring)] text-[11px] font-mono"
              />
              {allServices.length > 0 && (
                <button
                  onClick={() => updateStep(i, { manualInput: false })}
                  className="text-[10px] text-[var(--color-primary)] hover:underline shrink-0 px-1"
                >
                  {t("chain.selectMode")}
                </button>
              )}
            </div>
          ) : (
            <div className="flex gap-1">
              <SearchableSelect
                value={step.serviceName}
                options={allServices.map((svc) => ({
                  value: svc.fullName,
                  label: svc.fullName,
                  searchExtra: svc.methods?.map((m) => m.methodName).join(" ") ?? "",
                }))}
                placeholder={t("chain.selectService")}
                onChange={(val) => handleServiceChange(i, val)}
                className="flex-1"
              />
              <SearchableSelect
                value={step.methodName}
                options={
                  allServices
                    .find((s) => s.fullName === step.serviceName)
                    ?.methods?.map((m) => ({
                      value: m.methodName,
                      label: m.methodName,
                      searchExtra: `${step.serviceName}.${m.methodName}`,
                    })) ?? []
                }
                placeholder={t("chain.selectMethod")}
                disabled={!step.serviceName}
                onChange={(val) => handleMethodChange(i, step.serviceName, val)}
                className="flex-1"
              />
              <button
                onClick={() => updateStep(i, { manualInput: true })}
                className="text-[10px] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:underline shrink-0 px-1"
              >
                {t("chain.manualInput")}
              </button>
            </div>
          )}
          <textarea
            value={step.body}
            onChange={(e) => updateStep(i, { body: e.target.value })}
            placeholder={'{\n  "field": "{{prev.id}}"\n}'}
            className="w-full bg-[var(--color-secondary)] px-2 py-1 rounded border border-[var(--color-input)] focus:outline-none focus:ring-1 focus:ring-[var(--color-ring)] text-[11px] font-mono resize-none h-16"
            spellCheck={false}
          />
        </div>
      ))}

      <button onClick={addStep} className="flex items-center gap-1 text-[11px] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] py-1">
        <Plus size={12} /> {t("chain.addStep")}
      </button>

      <button
        onClick={runChain}
        disabled={running || steps.length === 0}
        className="flex items-center justify-center gap-2 px-4 py-2 rounded bg-[var(--color-primary)] text-white text-xs font-medium hover:bg-[var(--color-primary)]/80 disabled:opacity-50"
      >
        {running ? <><Loader2 size={14} className="animate-spin" /> {t("chain.running")}</> : <><Play size={14} /> {t("chain.runChain")}</>}
      </button>

      {results.length > 0 && (
        <div className="flex flex-col gap-1 mt-2">
          <div className="text-[11px] font-medium text-[var(--color-muted-foreground)]">{t("chain.results")}</div>
          {results.map((r) => (
            <div key={r.index} className="border border-[var(--color-border)] rounded">
              <div
                className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-[var(--color-secondary)]"
                onClick={() => toggleResult(r.index)}
              >
                {expandedResults.has(r.index) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <span className="font-medium">{t("chain.stepN", { n: r.index + 1 })}</span>
                <span className={cn("text-[10px] font-mono", r.statusCode === "OK" ? "text-green-400" : "text-[var(--color-destructive)]")}>
                  {r.statusCode}
                </span>
                <span className="text-[10px] text-[var(--color-muted-foreground)] ml-auto">{r.elapsedMs}ms</span>
              </div>
              {expandedResults.has(r.index) && (
                <pre className="px-2 py-1.5 text-[10px] font-mono bg-[var(--color-secondary)] border-t whitespace-pre-wrap max-h-32 overflow-auto">
                  {r.error || r.body || t("chain.empty")}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
