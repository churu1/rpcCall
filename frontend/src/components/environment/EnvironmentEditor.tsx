import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useEnvStore } from "@/store/env-store";
import { Plus, Trash2, X, Save } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { IconButton } from "@/components/ui/IconButton";

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
      <div className="bg-[var(--surface-0)] border border-[var(--line-soft)] rounded-lg shadow-[var(--elevation-2)] w-[600px] max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--line-soft)]">
          <h3 className="text-sm font-medium">{t("environment.manageTitle")}</h3>
          <IconButton size="sm" className="border-0 bg-transparent" onClick={onClose}>
            <X size={14} />
          </IconButton>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Left: env list */}
          <div className="w-44 border-r flex flex-col">
            <div className="flex-1 overflow-auto">
              {environments.map((env) => (
                <button
                  key={env.id}
                  onClick={() => setSelectedId(env.id)}
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-[var(--surface-2)] ${selectedId === env.id ? "bg-[var(--surface-2)] text-[var(--state-info)]" : ""}`}
                >
                  {env.name}
                  {env.isActive && <span className="ml-1 text-[var(--color-method-unary)]">●</span>}
                </button>
              ))}
            </div>
            <Button
              onClick={handleNew}
              variant="ghost"
              className="justify-start rounded-none border-t border-[var(--line-soft)]"
            >
              <Plus size={12} /> {t("environment.newEnv")}
            </Button>
          </div>

          {/* Right: editor */}
          <div className="flex-1 flex flex-col p-4 overflow-auto">
            {selectedId ? (
              <>
                <div className="mb-3">
                  <label className="text-[10px] text-[var(--text-muted)] mb-1 block">{t("environment.name")}</label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full"
                  />
                </div>
                <label className="text-[10px] text-[var(--text-muted)] mb-1 block">{t("environment.variables")}</label>
                <div className="flex flex-col gap-1.5">
                  {vars.map((v, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <Input
                        value={v.key}
                        onChange={(e) => updateVar(i, "key", e.target.value)}
                        placeholder="key"
                        className="flex-1 font-mono"
                      />
                      <Input
                        value={v.value}
                        onChange={(e) => updateVar(i, "value", e.target.value)}
                        placeholder="value"
                        className="flex-1 font-mono"
                      />
                      <Button variant="danger" size="sm" className="h-7 w-7 px-0" onClick={() => removeVar(i)}>
                        <Trash2 size={12} />
                      </Button>
                    </div>
                  ))}
                  <Button onClick={addVar} variant="ghost" size="sm" className="self-start">
                    <Plus size={11} /> {t("environment.addVariable")}
                  </Button>
                </div>
                <div className="flex items-center gap-2 mt-4 pt-3 border-t border-[var(--line-soft)]">
                  <Button
                    onClick={handleSave}
                    variant="primary"
                  >
                    <Save size={12} /> {t("common.save")}
                  </Button>
                  <Button
                    onClick={handleDelete}
                    variant="danger"
                  >
                    <Trash2 size={12} /> {t("common.delete")}
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-xs text-[var(--text-muted)]">
                {t("environment.selectOrCreate")}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
