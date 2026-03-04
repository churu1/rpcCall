import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, Play, Square } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

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
    <div className="flex flex-col gap-3 p-3 text-xs bg-[var(--surface-1)] h-full overflow-auto">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-medium text-[var(--text-muted)]">{t("mock.title")}</div>
        {running && (
          <span className="text-[10px] text-green-400 flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
            {t("mock.runningOn")}{serverPort}
          </span>
        )}
      </div>

      {error && (
        <div className="px-2 py-1.5 rounded border border-[var(--state-error)]/25 bg-[var(--state-error)]/10 text-[var(--state-error)] text-[11px]">
          {error}
        </div>
      )}

      {!running && (
        <>
          <div className="flex items-center gap-2">
            <label className="text-[11px] text-[var(--text-muted)] shrink-0">{t("mock.port")}</label>
            <Input
              type="number"
              min={1024}
              max={65535}
              value={port}
              onChange={(e) => setPort(Number(e.target.value))}
              className="w-24"
            />
          </div>

          <div className="text-[10px] font-medium text-[var(--text-muted)]">{t("mock.rules")}</div>
          {rules.map((rule, i) => (
            <Card key={i} className="p-2 flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[var(--state-info)]">{t("mock.ruleN", { n: i + 1 })}</span>
                {rules.length > 1 && (
                  <Button variant="danger" size="sm" className="h-6 w-6 px-0" onClick={() => removeRule(i)}>
                    <Trash2 size={11} />
                  </Button>
                )}
              </div>
              <div className="flex gap-1">
                <Input
                  value={rule.serviceName}
                  onChange={(e) => updateRule(i, { serviceName: e.target.value })}
                  placeholder={t("mock.servicePlaceholder")}
                  className="flex-1 text-[11px] font-mono"
                />
                <Input
                  value={rule.methodName}
                  onChange={(e) => updateRule(i, { methodName: e.target.value })}
                  placeholder={t("mock.methodPlaceholder")}
                  className="flex-1 text-[11px] font-mono"
                />
              </div>
              <div className="flex gap-1">
                <Select
                  value={rule.statusCode}
                  onChange={(e) => updateRule(i, { statusCode: e.target.value })}
                  className="flex-1 text-[11px]"
                >
                  {statusCodes.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    min={0}
                    value={rule.delayMs}
                    onChange={(e) => updateRule(i, { delayMs: Math.max(0, Number(e.target.value)) })}
                    placeholder="0"
                    className="w-20 text-[11px]"
                  />
                  <span className="text-[10px] text-[var(--text-muted)]">ms</span>
                </div>
              </div>
              <textarea
                value={rule.responseBody}
                onChange={(e) => updateRule(i, { responseBody: e.target.value })}
                placeholder={t("mock.responseBodyPlaceholder")}
                className="w-full bg-[var(--surface-1)] px-2 py-1 rounded border border-[var(--line-strong)] focus:outline-none focus:ring-1 focus:ring-[var(--focus-ring)] text-[11px] font-mono resize-none h-14"
                spellCheck={false}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
              />
            </Card>
          ))}

          <Button onClick={addRule} variant="ghost" size="sm" className="self-start">
            <Plus size={12} /> {t("mock.addRule")}
          </Button>
        </>
      )}

      <Button
        onClick={running ? handleStop : handleStart}
        variant={running ? "danger" : "primary"}
        className="self-start px-4"
      >
        {running ? <><Square size={14} /> {t("mock.stopServer")}</> : <><Play size={14} /> {t("mock.startServer")}</>}
      </Button>
    </div>
  );
}
