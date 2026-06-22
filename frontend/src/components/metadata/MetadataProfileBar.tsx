import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw, ShieldCheck, ShieldOff, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";

interface Props {
  address: string;
}

export function MetadataProfileBar({ address }: Props) {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<MetadataProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!address.trim()) {
      setProfile(null);
      return;
    }
    const item = await window.go.main.App.GetMetadataProfile(address);
    setProfile(item ?? null);
  }, [address]);

  useEffect(() => {
    load().catch(() => setProfile(null));
  }, [load]);

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<{ address?: string }>;
      if (!custom.detail?.address || custom.detail.address === address) {
        load().catch(() => setProfile(null));
      }
    };
    window.addEventListener("rpccall:metadata-profile-changed", handler as EventListener);
    return () => window.removeEventListener("rpccall:metadata-profile-changed", handler as EventListener);
  }, [address, load]);

  if (!profile) return null;

  const refresh = async () => {
    setLoading(true);
    setMessage("");
    try {
      const updated = await window.go.main.App.RefreshMetadataProfile(address);
      setProfile(updated ?? null);
      setMessage(t("metadataProfile.refreshed"));
      window.dispatchEvent(new CustomEvent("rpccall:metadata-profile-changed", { detail: { address } }));
    } catch (e: unknown) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const toggle = async () => {
    await window.go.main.App.SetMetadataProfileEnabled(address, !profile.enabled);
    await load();
    window.dispatchEvent(new CustomEvent("rpccall:metadata-profile-changed", { detail: { address } }));
  };

  const clear = async () => {
    if (!confirm(t("metadataProfile.clearConfirm"))) return;
    await window.go.main.App.DeleteMetadataProfile(address);
    setProfile(null);
    window.dispatchEvent(new CustomEvent("rpccall:metadata-profile-changed", { detail: { address } }));
  };

  return (
    <div className="group/profile relative m-2 rounded-lg border border-[var(--line-soft)] bg-[var(--surface-1)] px-2 py-2">
      <div className="flex items-center gap-2">
        {profile.enabled ? (
          <ShieldCheck size={14} className="text-[var(--state-success)]" />
        ) : (
          <ShieldOff size={14} className="text-[var(--text-muted)]" />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11px] font-medium text-[var(--text-normal)]">
            {t("metadataProfile.active", { count: profile.metadata.length })}
          </div>
          <div className="truncate text-[10px] text-[var(--text-muted)]">
            {profile.metadata.map((entry) => entry.key).join(", ")}
          </div>
        </div>
        <Button onClick={toggle} size="sm" variant="ghost">
          {profile.enabled ? t("metadataProfile.disable") : t("metadataProfile.enable")}
        </Button>
        <IconButton onClick={refresh} disabled={loading} size="sm" title={t("metadataProfile.refresh")}>
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
        </IconButton>
        <IconButton onClick={clear} size="sm" tone="danger" title={t("metadataProfile.clear")}>
          <Trash2 size={12} />
        </IconButton>
      </div>
      <div className="pointer-events-none absolute left-2 right-2 top-[calc(100%+6px)] z-30 max-h-64 overflow-auto rounded-lg border border-[var(--line-soft)] bg-[var(--surface-0)] p-2 opacity-0 shadow-xl transition-opacity group-hover/profile:opacity-100">
        <div className="mb-1 text-[10px] font-medium text-[var(--text-muted)]">
          {t("metadataProfile.hoverTitle")}
        </div>
        <div className="flex flex-col gap-1 font-[var(--font-mono)] text-[11px]">
          {profile.metadata.map((entry) => (
            <div key={entry.key} className="grid grid-cols-[minmax(80px,0.45fr)_1fr] gap-2 rounded bg-[var(--surface-1)] px-2 py-1">
              <span className="truncate text-[var(--state-info)]">{entry.key}</span>
              <span className="break-all text-[var(--text-normal)]">{entry.value}</span>
            </div>
          ))}
        </div>
      </div>
      {message && <div className="mt-1 text-[10px] text-[var(--text-muted)]">{message}</div>}
    </div>
  );
}
