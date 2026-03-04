import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { IconButton } from "@/components/ui/IconButton";

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
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onMouseDown={onClose} />
      <div
        className="relative w-[440px] bg-[var(--surface-0)] border border-[var(--line-soft)] rounded-xl shadow-[var(--elevation-2)] overflow-hidden"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--line-soft)]">
          <span className="text-sm font-medium">{t("ai.settingsTitle")}</span>
          <IconButton size="sm" className="border-0 bg-transparent" onClick={onClose}>
            <X size={14} />
          </IconButton>
        </div>

        <div className="p-4 flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[var(--text-muted)]">{t("ai.endpoint")}</label>
            <Input
              type="text"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="https://api.openai.com"
              className="w-full font-mono"
            />
            <span className="text-[10px] text-[var(--text-muted)]">
              {t("ai.endpointHint")}
            </span>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[var(--text-muted)]">{t("ai.apiKey")}</label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              className="w-full font-mono"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[var(--text-muted)]">{t("ai.model")}</label>
            <Input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="gpt-3.5-turbo"
              className="w-full font-mono"
            />
            <span className="text-[10px] text-[var(--text-muted)]">
              {t("ai.modelHint")}
            </span>
          </div>

          {error && (
            <div className="text-[11px] text-[var(--state-error)] bg-[var(--state-error)]/10 border border-[var(--state-error)]/25 px-2 py-1.5 rounded">
              {error}
            </div>
          )}
          {success && (
            <div className="text-[11px] text-green-500 bg-green-500/10 px-2 py-1.5 rounded">
              {t("ai.saved")}
            </div>
          )}

          <Button
            onClick={handleSave}
            disabled={saving || !endpoint.trim() || !apiKey.trim()}
            variant="primary"
            className="w-full"
          >
            {saving && <Loader2 size={12} className="animate-spin" />}
            {t("common.save")}
          </Button>
        </div>
      </div>
    </div>
  );
}
