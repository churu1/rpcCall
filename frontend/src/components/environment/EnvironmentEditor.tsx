import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useEnvStore } from "@/store/env-store";
import { Plus, Trash2, X, Save } from "lucide-react";

interface Props {
  onClose: () => void;
}

export function EnvironmentEditor({ onClose }: Props) {
  const { t } = useTranslation();
  const { environments, loadEnvironments, saveEnvironment, updateEnvironment, deleteEnvironment } = useEnvStore();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [vars, setVars] = useState<{ key: string; value: string }[]>([]);

  useEffect(() => { loadEnvironments(); }, [loadEnvironments]);

  useEffect(() => {
    const env = environments.find((e) => e.id === selectedId);
    if (env) {
      setName(env.name);
      const entries = Object.entries(env.variables ?? {}).map(([key, value]) => ({ key, value }));
      if (entries.length === 0) entries.push({ key: "", value: "" });
      setVars(entries);
    }
  }, [selectedId, environments]);

  const handleNew = async () => {
    const newName = `env-${environments.length + 1}`;
    await saveEnvironment(newName, {});
    await loadEnvironments();
  };

  const handleSave = async () => {
    if (!selectedId || !name.trim()) return;
    const variables: Record<string, string> = {};
    for (const v of vars) {
      if (v.key.trim()) variables[v.key.trim()] = v.value;
    }
    await updateEnvironment(selectedId, name.trim(), variables);
  };

  const handleDelete = async () => {
    if (!selectedId) return;
    await deleteEnvironment(selectedId);
    setSelectedId(null);
    setName("");
    setVars([{ key: "", value: "" }]);
  };

  const addVar = () => setVars([...vars, { key: "", value: "" }]);
  const removeVar = (i: number) => setVars(vars.filter((_, idx) => idx !== i));
  const updateVar = (i: number, field: "key" | "value", val: string) =>
    setVars(vars.map((v, idx) => (idx === i ? { ...v, [field]: val } : v)));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-[var(--color-card)] border rounded-lg shadow-xl w-[600px] max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="text-sm font-medium">{t("environment.manageTitle")}</h3>
          <button onClick={onClose} className="p-1 hover:bg-[var(--color-secondary)] rounded">
            <X size={14} />
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Left: env list */}
          <div className="w-44 border-r flex flex-col">
            <div className="flex-1 overflow-auto">
              {environments.map((env) => (
                <button
                  key={env.id}
                  onClick={() => setSelectedId(env.id)}
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-[var(--color-secondary)] ${selectedId === env.id ? "bg-[var(--color-secondary)] text-[var(--color-primary)]" : ""}`}
                >
                  {env.name}
                  {env.isActive && <span className="ml-1 text-[var(--color-method-unary)]">●</span>}
                </button>
              ))}
            </div>
            <button
              onClick={handleNew}
              className="flex items-center gap-1 text-xs px-3 py-2 hover:bg-[var(--color-secondary)] text-[var(--color-muted-foreground)] border-t"
            >
              <Plus size={12} /> {t("environment.newEnv")}
            </button>
          </div>

          {/* Right: editor */}
          <div className="flex-1 flex flex-col p-4 overflow-auto">
            {selectedId ? (
              <>
                <div className="mb-3">
                  <label className="text-[10px] text-[var(--color-muted-foreground)] mb-1 block">{t("environment.name")}</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-[var(--color-secondary)] text-xs px-2 py-1.5 rounded border border-[var(--color-input)] focus:outline-none focus:ring-1 focus:ring-[var(--color-ring)]"
                  />
                </div>
                <label className="text-[10px] text-[var(--color-muted-foreground)] mb-1 block">{t("environment.variables")}</label>
                <div className="flex flex-col gap-1.5">
                  {vars.map((v, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <input
                        value={v.key}
                        onChange={(e) => updateVar(i, "key", e.target.value)}
                        placeholder="key"
                        className="flex-1 bg-[var(--color-secondary)] text-xs px-2 py-1 rounded border border-[var(--color-input)] focus:outline-none focus:ring-1 focus:ring-[var(--color-ring)] font-mono"
                      />
                      <input
                        value={v.value}
                        onChange={(e) => updateVar(i, "value", e.target.value)}
                        placeholder="value"
                        className="flex-1 bg-[var(--color-secondary)] text-xs px-2 py-1 rounded border border-[var(--color-input)] focus:outline-none focus:ring-1 focus:ring-[var(--color-ring)] font-mono"
                      />
                      <button onClick={() => removeVar(i)} className="p-1 hover:bg-[var(--color-secondary)] rounded text-[var(--color-muted-foreground)] hover:text-[var(--color-destructive)]">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                  <button onClick={addVar} className="flex items-center gap-1 text-[10px] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] py-1">
                    <Plus size={11} /> {t("environment.addVariable")}
                  </button>
                </div>
                <div className="flex items-center gap-2 mt-4 pt-3 border-t">
                  <button
                    onClick={handleSave}
                    className="flex items-center gap-1 text-xs px-3 py-1.5 bg-[var(--color-primary)] text-white rounded hover:bg-[var(--color-primary)]/80"
                  >
                    <Save size={12} /> {t("common.save")}
                  </button>
                  <button
                    onClick={handleDelete}
                    className="flex items-center gap-1 text-xs px-3 py-1.5 text-[var(--color-destructive)] hover:bg-[var(--color-secondary)] rounded"
                  >
                    <Trash2 size={12} /> {t("common.delete")}
                  </button>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-xs text-[var(--color-muted-foreground)]">
                {t("environment.selectOrCreate")}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
