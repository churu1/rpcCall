import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, Play, Square } from "lucide-react";

export function MockPanel() {
  const { t } = useTranslation();
  const [port, setPort] = useState(50051);
  const [rules, setRules] = useState<MockRule[]>([{ serviceName: "", methodName: "", statusCode: "OK", delayMs: 0, responseBody: "" }]);
  const [running, setRunning] = useState(false);
  const [serverPort, setServerPort] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const checkStatus = useCallback(async () => {
    try {
      const isRunning = await window.go.main.App.IsMockServerRunning();
      setRunning(isRunning);
      if (isRunning) {
        const p = await window.go.main.App.GetMockServerPort();
        setServerPort(p);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { checkStatus(); }, [checkStatus]);

  const addRule = () => setRules([...rules, { serviceName: "", methodName: "", statusCode: "OK", delayMs: 0, responseBody: "" }]);
  const removeRule = (i: number) => setRules(rules.filter((_, idx) => idx !== i));
  const updateRule = (i: number, updates: Partial<MockRule>) => setRules(rules.map((r, idx) => (idx === i ? { ...r, ...updates } : r)));

  const handleStart = async () => {
    setError(null);
    try {
      const validRules = rules.filter((r) => r.serviceName && r.methodName);
      await window.go.main.App.StartMockServer(port, validRules);
      setRunning(true);
      setServerPort(port);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleStop = async () => {
    try {
      await window.go.main.App.StopMockServer();
      setRunning(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const statusCodes = ["OK", "NOT_FOUND", "INVALID_ARGUMENT", "PERMISSION_DENIED", "UNAUTHENTICATED", "UNAVAILABLE", "DEADLINE_EXCEEDED", "INTERNAL", "ALREADY_EXISTS", "RESOURCE_EXHAUSTED", "CANCELLED"];

  return (
    <div className="flex flex-col gap-3 p-3 text-xs">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-medium text-[var(--color-muted-foreground)]">{t("mock.title")}</div>
        {running && (
          <span className="text-[10px] text-green-400 flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
            {t("mock.runningOn")}{serverPort}
          </span>
        )}
      </div>

      {error && (
        <div className="px-2 py-1.5 rounded bg-[var(--color-destructive)]/10 text-[var(--color-destructive)] text-[11px]">
          {error}
        </div>
      )}

      {!running && (
        <>
          <div className="flex items-center gap-2">
            <label className="text-[11px] text-[var(--color-muted-foreground)] shrink-0">{t("mock.port")}</label>
            <input
              type="number"
              min={1024}
              max={65535}
              value={port}
              onChange={(e) => setPort(Number(e.target.value))}
              className="w-24 bg-[var(--color-secondary)] px-2 py-1 rounded border border-[var(--color-input)] focus:outline-none focus:ring-1 focus:ring-[var(--color-ring)]"
            />
          </div>

          <div className="text-[10px] font-medium text-[var(--color-muted-foreground)]">{t("mock.rules")}</div>
          {rules.map((rule, i) => (
            <div key={i} className="border border-[var(--color-border)] rounded p-2 flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[var(--color-primary)]">{t("mock.ruleN", { n: i + 1 })}</span>
                {rules.length > 1 && (
                  <button onClick={() => removeRule(i)} className="p-0.5 hover:text-[var(--color-destructive)]">
                    <Trash2 size={11} />
                  </button>
                )}
              </div>
              <div className="flex gap-1">
                <input
                  value={rule.serviceName}
                  onChange={(e) => updateRule(i, { serviceName: e.target.value })}
                  placeholder={t("mock.servicePlaceholder")}
                  className="flex-1 bg-[var(--color-secondary)] px-2 py-1 rounded border border-[var(--color-input)] focus:outline-none focus:ring-1 focus:ring-[var(--color-ring)] text-[11px] font-mono"
                />
                <input
                  value={rule.methodName}
                  onChange={(e) => updateRule(i, { methodName: e.target.value })}
                  placeholder={t("mock.methodPlaceholder")}
                  className="flex-1 bg-[var(--color-secondary)] px-2 py-1 rounded border border-[var(--color-input)] focus:outline-none focus:ring-1 focus:ring-[var(--color-ring)] text-[11px] font-mono"
                />
              </div>
              <div className="flex gap-1">
                <select
                  value={rule.statusCode}
                  onChange={(e) => updateRule(i, { statusCode: e.target.value })}
                  className="flex-1 bg-[var(--color-secondary)] px-2 py-1 rounded border border-[var(--color-input)] focus:outline-none text-[11px]"
                >
                  {statusCodes.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    value={rule.delayMs}
                    onChange={(e) => updateRule(i, { delayMs: Math.max(0, Number(e.target.value)) })}
                    placeholder="0"
                    className="w-20 bg-[var(--color-secondary)] px-2 py-1 rounded border border-[var(--color-input)] focus:outline-none focus:ring-1 focus:ring-[var(--color-ring)] text-[11px]"
                  />
                  <span className="text-[10px] text-[var(--color-muted-foreground)]">ms</span>
                </div>
              </div>
              <textarea
                value={rule.responseBody}
                onChange={(e) => updateRule(i, { responseBody: e.target.value })}
                placeholder={t("mock.responseBodyPlaceholder")}
                className="w-full bg-[var(--color-secondary)] px-2 py-1 rounded border border-[var(--color-input)] focus:outline-none focus:ring-1 focus:ring-[var(--color-ring)] text-[11px] font-mono resize-none h-14"
                spellCheck={false}
              />
            </div>
          ))}

          <button onClick={addRule} className="flex items-center gap-1 text-[11px] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] py-1">
            <Plus size={12} /> {t("mock.addRule")}
          </button>
        </>
      )}

      <button
        onClick={running ? handleStop : handleStart}
        className={`flex items-center justify-center gap-2 px-4 py-2 rounded text-xs font-medium text-white ${
          running ? "bg-[var(--color-destructive)] hover:bg-[var(--color-destructive)]/80" : "bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/80"
        }`}
      >
        {running ? <><Square size={14} /> {t("mock.stopServer")}</> : <><Play size={14} /> {t("mock.startServer")}</>}
      </button>
    </div>
  );
}
