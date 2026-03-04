import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore, type ChainStepConfig } from "@/store/app-store";
import { Plus, Trash2, Play, Loader2, ChevronDown, Save, FolderOpen, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";

export function ChainEditor() {
  const { t } = useTranslation();
  const { tabs, activeTabId, updateTab, protoFiles } = useAppStore();
  const tab = tabs.find((t) => t.id === activeTabId);

  const allServices = useMemo(() => {
    return protoFiles.filter((f) => f.projectId === tab?.projectId).flatMap((f) => f.services ?? []);
  }, [protoFiles, tab?.projectId]);

  const defaultSteps = (): ChainStepConfig[] => [
    {
      projectId: tab?.projectId || undefined,
      address: tab?.address || "localhost:50051",
      serviceName: tab?.method?.serviceName || "",
      methodName: tab?.method?.methodName || "",
      body: tab?.requestBody || '{\n  \n}',
    },
  ];

  const steps = tab?.chainSteps?.length ? tab.chainSteps : defaultSteps();

  const setSteps = useCallback((newSteps: ChainStepConfig[] | ((prev: ChainStepConfig[]) => ChainStepConfig[])) => {
    if (!activeTabId) return;
    const resolved = typeof newSteps === "function" ? newSteps(steps) : newSteps;
    updateTab(activeTabId, { chainSteps: resolved });
  }, [activeTabId, steps, updateTab]);

  const [savedAddresses, setSavedAddresses] = useState<{ name: string; address: string }[]>([]);
  useEffect(() => {
    window.go.main.App.ListAddresses().then((list) => setSavedAddresses(list ?? [])).catch(() => {});
  }, []);

  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [templates, setTemplates] = useState<ChainTemplate[]>([]);
  const [saveName, setSaveName] = useState("");
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const loadTemplates = useCallback(async () => {
    try {
      const list = await window.go.main.App.ListChainTemplates();
      setTemplates(list ?? []);
    } catch { /* ignore */ }
  }, []);

  const handleSaveTemplate = async () => {
    if (!saveName.trim()) return;
    try {
      await window.go.main.App.SaveChainTemplate(saveName.trim(), JSON.stringify(steps));
      setSaveName("");
      setShowSaveInput(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
      loadTemplates();
    } catch { /* ignore */ }
  };

  const handleLoadTemplate = (tpl: ChainTemplate) => {
    try {
      const parsed = JSON.parse(tpl.stepsJson) as ChainStepConfig[];
      if (parsed.length > 0) {
        setSteps(parsed);
        setShowTemplates(false);
      }
    } catch { /* ignore */ }
  };

  const handleDeleteTemplate = async (id: number) => {
    try {
      await window.go.main.App.DeleteChainTemplate(id);
      loadTemplates();
    } catch { /* ignore */ }
  };

  const addStep = () => {
    setSteps([...steps, {
      projectId: tab?.projectId || undefined,
      address: tab?.address || "localhost:50051",
      serviceName: "",
      methodName: "",
      body: '{\n  \n}',
      manualInput: allServices.length === 0,
    }]);
  };

  const removeStep = (i: number) => {
    setSteps(steps.filter((_, idx) => idx !== i));
  };

  const updateStep = (i: number, updates: Partial<ChainStepConfig>) => {
    setSteps(steps.map((s, idx) => (idx === i ? { ...s, ...updates } : s)));
  };

  const handleServiceChange = (i: number, serviceName: string) => {
    updateStep(i, { serviceName, methodName: "", body: '{\n  \n}' });
  };

  const handleMethodChange = async (i: number, serviceName: string, methodName: string) => {
    updateStep(i, { methodName });
    if (serviceName && methodName) {
      try {
        if (!tab?.projectId) return;
        const template = await window.go.main.App.GetMethodTemplate(tab.projectId, serviceName, methodName);
        if (template) updateStep(i, { methodName, body: template });
      } catch { /* ignore */ }
    }
  };

  const runChain = useCallback(async () => {
    if (steps.length === 0 || !activeTabId) return;
    setRunning(true);
    setError(null);
    updateTab(activeTabId, { chainResults: [] });
    try {
      const chainSteps: ChainStep[] = steps.map((s) => ({
        address: s.address,
        projectId: s.projectId || tab?.projectId || "",
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
      updateTab(activeTabId, { chainResults: result.steps || [] });
      document.dispatchEvent(new CustomEvent("rpccall:show-chain-results"));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }, [steps, tab, activeTabId, updateTab]);

  return (
    <div className="flex flex-col gap-3 p-3 text-xs bg-[var(--surface-1)] h-full overflow-auto">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-medium text-[var(--text-muted)]">
          {t("chain.description")}
        </div>
        <div className="flex items-center gap-1">
          {saveSuccess && (
            <span className="text-[10px] text-green-500">{t("chain.templateSaved")}</span>
          )}
          <Button
            onClick={() => { setShowSaveInput(!showSaveInput); setShowTemplates(false); }}
            variant="ghost"
            size="sm"
            className="h-7 px-1.5 text-[10px] whitespace-nowrap"
            title={t("chain.saveTemplate")}
          >
            <Save size={11} /> {t("chain.saveTemplate")}
          </Button>
          <Button
            onClick={() => { setShowTemplates(!showTemplates); setShowSaveInput(false); if (!showTemplates) loadTemplates(); }}
            variant="ghost"
            size="sm"
            className="h-7 px-1.5 text-[10px] whitespace-nowrap"
            title={t("chain.loadTemplate")}
          >
            <FolderOpen size={11} /> {t("chain.loadTemplate")}
          </Button>
        </div>
      </div>

      {showSaveInput && (
        <Card className="flex items-center gap-2 p-2">
          <Input
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSaveTemplate()}
            placeholder={t("chain.templateNamePlaceholder")}
            className="flex-1 text-[11px]"
            autoFocus
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-form-type="other"
            data-lpignore="true"
          />
          <Button
            onClick={handleSaveTemplate}
            disabled={!saveName.trim()}
            variant="primary"
            size="sm"
          >
            {t("common.save")}
          </Button>
          <Button variant="secondary" size="sm" className="h-7 w-7 px-0" onClick={() => setShowSaveInput(false)}>
            <X size={12} />
          </Button>
        </Card>
      )}

      {showTemplates && (
        <Card className="flex flex-col gap-1 p-2 max-h-[160px] overflow-y-auto">
          <div className="text-[10px] font-medium text-[var(--text-muted)] mb-0.5">{t("chain.savedTemplates")}</div>
          {templates.length === 0 ? (
            <div className="text-[10px] text-[var(--text-muted)] text-center py-2">{t("chain.noTemplates")}</div>
          ) : (
            templates.map((tpl) => {
              let stepCount = 0;
              try { stepCount = JSON.parse(tpl.stepsJson).length; } catch { /* ignore */ }
              return (
                <div
                  key={tpl.id}
                  className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-[var(--surface-2)] cursor-pointer group"
                  onClick={() => handleLoadTemplate(tpl)}
                >
                  <div className="flex flex-col min-w-0">
                    <span className="text-[11px] font-medium truncate">{tpl.name}</span>
                    <span className="text-[10px] text-[var(--text-muted)]">
                      {stepCount} {t("chain.stepN", { n: "" }).replace(/\s*$/, "")} · {new Date(tpl.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteTemplate(tpl.id); }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-[var(--surface-1)] rounded text-[var(--text-muted)] hover:text-[var(--state-error)]"
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              );
            })
          )}
        </Card>
      )}

      {error && (
        <div className="px-2 py-1.5 rounded border border-[var(--state-error)]/25 bg-[var(--state-error)]/10 text-[var(--state-error)] text-[11px]">
          {error}
        </div>
      )}

      {steps.map((step, i) => (
        <Card key={i} className="p-2 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium text-[var(--state-info)]">{t("chain.stepN", { n: i + 1 })}</span>
            {steps.length > 1 && (
              <Button variant="danger" size="sm" className="h-6 w-6 px-0" onClick={() => removeStep(i)}>
                <Trash2 size={11} />
              </Button>
            )}
          </div>
          <AddressInput
            value={step.address}
            onChange={(val) => updateStep(i, { address: val })}
            placeholder={t("chain.addressPlaceholder")}
            savedAddresses={savedAddresses}
          />
          {step.manualInput || allServices.length === 0 ? (
            <div className="flex gap-1">
              <Input
                value={step.serviceName}
                onChange={(e) => updateStep(i, { serviceName: e.target.value })}
                placeholder={t("chain.servicePlaceholder")}
                className="flex-1 text-[11px] font-mono"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                data-form-type="other"
                data-lpignore="true"
              />
              <Input
                value={step.methodName}
                onChange={(e) => updateStep(i, { methodName: e.target.value })}
                placeholder={t("chain.methodPlaceholder")}
                className="flex-1 text-[11px] font-mono"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                data-form-type="other"
                data-lpignore="true"
              />
              {allServices.length > 0 && (
                <Button
                  onClick={() => updateStep(i, { manualInput: false })}
                  variant="ghost"
                  size="sm"
                  className="text-[10px] text-[var(--state-info)] shrink-0 px-1"
                >
                  {t("chain.selectMode")}
                </Button>
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
              <Button
                onClick={() => updateStep(i, { manualInput: true })}
                variant="ghost"
                size="sm"
                className="text-[10px] text-[var(--text-muted)] shrink-0 px-1"
              >
                {t("chain.manualInput")}
              </Button>
            </div>
          )}
          <textarea
            value={step.body}
            onChange={(e) => updateStep(i, { body: e.target.value })}
            placeholder={'{\n  "field": "{{prev.id}}"\n}'}
            className="w-full bg-[var(--surface-2)] px-2 py-1 rounded border border-[var(--line-strong)] focus:outline-none focus:ring-1 focus:ring-[var(--focus-ring)] text-[11px] font-mono resize-none h-16"
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
          />
        </Card>
      ))}

      <Button onClick={addStep} variant="ghost" size="sm" className="self-start">
        <Plus size={12} /> {t("chain.addStep")}
      </Button>

      <Button
        onClick={runChain}
        disabled={running || steps.length === 0}
        variant="primary"
        className="self-start px-4"
      >
        {running ? <><Loader2 size={14} className="animate-spin" /> {t("chain.running")}</> : <><Play size={14} /> {t("chain.runChain")}</>}
      </Button>
    </div>
  );
}

function AddressInput({
  value,
  onChange,
  placeholder,
  savedAddresses,
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder: string;
  savedAddresses: { name: string; address: string }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <div className="flex">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 text-[11px] font-mono rounded-r-none border-r-0"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          data-form-type="other"
          data-lpignore="true"
        />
        {savedAddresses.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="px-1.5 bg-[var(--surface-2)] border border-[var(--line-strong)] rounded-r hover:bg-[var(--surface-1)] transition-colors"
          >
            <ChevronDown size={10} className={cn("text-[var(--text-muted)] transition-transform", open && "rotate-180")} />
          </button>
        )}
      </div>
      {open && savedAddresses.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-[var(--surface-0)] border border-[var(--line-soft)] rounded-md shadow-[var(--elevation-2)] max-h-[120px] overflow-y-auto">
          {savedAddresses.map((addr) => (
            <div
              key={addr.address}
              className={cn(
                "flex items-center justify-between px-2 py-1.5 text-[11px] cursor-pointer hover:bg-[var(--surface-2)]",
                addr.address === value && "bg-[var(--surface-1)]"
              )}
              onClick={() => {
                onChange(addr.address);
                setOpen(false);
              }}
            >
              <span className="font-mono truncate">{addr.address}</span>
              {addr.name && (
                <span className="text-[10px] text-[var(--text-muted)] ml-2 shrink-0">{addr.name}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
