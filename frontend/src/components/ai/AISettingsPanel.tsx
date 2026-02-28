import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { X, Loader2 } from "lucide-react";

interface Props {
  onClose: () => void;
}

export function AISettingsPanel({ onClose }: Props) {
  const { t } = useTranslation();
  const [endpoint, setEndpoint] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    window.go.main.App.GetAIConfig().then((cfg) => {
      setEndpoint(cfg.endpoint || "");
      setApiKey(cfg.apiKey || "");
      setModel(cfg.model || "");
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await window.go.main.App.SaveAIConfig({ endpoint, apiKey, model });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative w-[440px] bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
          <span className="text-sm font-medium">{t("ai.settingsTitle")}</span>
          <button onClick={onClose} className="p-1 hover:bg-[var(--color-secondary)] rounded">
            <X size={14} />
          </button>
        </div>

        <div className="p-4 flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[var(--color-muted-foreground)]">{t("ai.endpoint")}</label>
            <input
              type="text"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="https://api.openai.com"
              className="w-full bg-[var(--color-secondary)] text-xs px-3 py-2 rounded border border-[var(--color-input)] focus:outline-none focus:ring-1 focus:ring-[var(--color-ring)] font-mono"
            />
            <span className="text-[10px] text-[var(--color-muted-foreground)]">
              {t("ai.endpointHint")}
            </span>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[var(--color-muted-foreground)]">{t("ai.apiKey")}</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              className="w-full bg-[var(--color-secondary)] text-xs px-3 py-2 rounded border border-[var(--color-input)] focus:outline-none focus:ring-1 focus:ring-[var(--color-ring)] font-mono"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[var(--color-muted-foreground)]">{t("ai.model")}</label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="gpt-3.5-turbo"
              className="w-full bg-[var(--color-secondary)] text-xs px-3 py-2 rounded border border-[var(--color-input)] focus:outline-none focus:ring-1 focus:ring-[var(--color-ring)] font-mono"
            />
            <span className="text-[10px] text-[var(--color-muted-foreground)]">
              {t("ai.modelHint")}
            </span>
          </div>

          {error && (
            <div className="text-[11px] text-[var(--color-destructive)] bg-[var(--color-destructive)]/10 px-2 py-1.5 rounded">
              {error}
            </div>
          )}
          {success && (
            <div className="text-[11px] text-green-500 bg-green-500/10 px-2 py-1.5 rounded">
              {t("ai.saved")}
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={saving || !endpoint.trim() || !apiKey.trim()}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded bg-[var(--color-primary)] text-white text-xs font-medium hover:bg-[var(--color-primary)]/80 disabled:opacity-50 transition-colors"
          >
            {saving && <Loader2 size={12} className="animate-spin" />}
            {t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
