import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw, ShieldCheck, ShieldOff, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

interface Props {
  address: string;
}

export function MetadataProfileBar({ address }: Props) {
  const { t } = useTranslation();
  const [profiles, setProfiles] = useState<MetadataProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [pendingDelete, setPendingDelete] = useState<MetadataProfile | null>(null);

  const load = useCallback(async () => {
    if (!address.trim()) {
      setProfiles([]);
      return;
    }
    const items = await window.go.main.App.ListMetadataProfilesByAddress(address);
    setProfiles(items ?? []);
  }, [address]);

  useEffect(() => {
    load().catch(() => setProfiles([]));
  }, [load]);

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<{ address?: string }>;
      if (!custom.detail?.address || custom.detail.address === address) {
        load().catch(() => setProfiles([]));
      }
    };
    window.addEventListener("rpccall:metadata-profile-changed", handler as EventListener);
    return () => window.removeEventListener("rpccall:metadata-profile-changed", handler as EventListener);
  }, [address, load]);

  if (profiles.length === 0) return null;

  const activeProfile = profiles.find((item) => item.enabled) ?? profiles[0];

  const refresh = async (profile: MetadataProfile) => {
    setLoading(true);
    setMessage("");
    try {
      await window.go.main.App.RefreshMetadataProfileByID(profile.id);
      await load();
      setMessage(t("metadataProfile.refreshed"));
      window.dispatchEvent(new CustomEvent("rpccall:metadata-profile-changed", { detail: { address } }));
    } catch (e: unknown) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const toggle = async (profile: MetadataProfile) => {
    await window.go.main.App.SetMetadataProfileEnabledByID(profile.id, !profile.enabled);
    await load();
    window.dispatchEvent(new CustomEvent("rpccall:metadata-profile-changed", { detail: { address } }));
  };

  const requestDelete = (profile: MetadataProfile) => {
    setPendingDelete(profile);
    setMessage("");
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await window.go.main.App.DeleteMetadataProfileByID(pendingDelete.id);
      setPendingDelete(null);
      setMessage("");
      await load();
      window.dispatchEvent(new CustomEvent("rpccall:metadata-profile-changed", { detail: { address } }));
    } catch (e: unknown) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="group/profile relative m-2 rounded-lg border border-[var(--line-soft)] bg-[var(--surface-1)] px-2 py-2">
      <div className="flex items-center gap-2">
        {activeProfile.enabled ? (
          <ShieldCheck size={14} className="text-[var(--state-success)]" />
        ) : (
          <ShieldOff size={14} className="text-[var(--text-muted)]" />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11px] font-medium text-[var(--text-normal)]">
            {activeProfile.enabled
              ? t("metadataProfile.activeNamed", { name: activeProfile.name, count: activeProfile.metadata.length })
              : t("metadataProfile.noneActive", { count: profiles.length })}
          </div>
          <div className="truncate text-[10px] text-[var(--text-muted)]">
            {activeProfile.metadata.map((entry) => entry.key).join(", ")}
          </div>
        </div>
        <Button onClick={() => toggle(activeProfile)} size="sm" variant="ghost">
          {activeProfile.enabled ? t("metadataProfile.disable") : t("metadataProfile.enable")}
        </Button>
        <IconButton onClick={() => refresh(activeProfile)} disabled={loading} size="sm" title={t("metadataProfile.refresh")}>
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
        </IconButton>
        <IconButton
          onClick={() => requestDelete(activeProfile)}
          size="sm"
          tone="danger"
          title={t("metadataProfile.clear")}
        >
          <Trash2 size={12} />
        </IconButton>
      </div>
      <div className="absolute left-2 right-2 top-[calc(100%+6px)] z-30 max-h-80 overflow-auto rounded-lg border border-[var(--line-soft)] bg-[var(--surface-0)] p-2 opacity-0 shadow-xl transition-opacity pointer-events-none group-hover/profile:pointer-events-auto group-hover/profile:opacity-100">
        <div className="mb-1 text-[10px] font-medium text-[var(--text-muted)]">
          {t("metadataProfile.hoverTitle")} ({profiles.length}/10)
        </div>
        <div className="flex flex-col gap-2 text-[11px]">
          {profiles.map((profile) => (
            <div key={profile.id} className="rounded bg-[var(--surface-1)] p-2">
              <div className="mb-1 flex items-center gap-2">
                {profile.enabled ? (
                  <ShieldCheck size={12} className="text-[var(--state-success)]" />
                ) : (
                  <ShieldOff size={12} className="text-[var(--text-muted)]" />
                )}
                <span className="font-medium text-[var(--text-normal)]">{profile.name}</span>
                <span className="ml-auto text-[10px] text-[var(--text-muted)]">{profile.metadata.length}</span>
                <Button onClick={() => toggle(profile)} size="sm" variant="ghost" className="h-6">
                  {profile.enabled ? t("metadataProfile.disable") : t("metadataProfile.enable")}
                </Button>
                <IconButton onClick={() => refresh(profile)} disabled={loading} size="sm" title={t("metadataProfile.refresh")}>
                  <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
                </IconButton>
                <IconButton
                  onClick={() => requestDelete(profile)}
                  size="sm"
                  tone="danger"
                  title={t("metadataProfile.clear")}
                >
                  <Trash2 size={11} />
                </IconButton>
              </div>
              <div className="flex flex-col gap-1 font-[var(--font-mono)]">
                {profile.metadata.map((entry) => (
                  <div key={entry.key} className="grid grid-cols-[minmax(80px,0.45fr)_1fr] gap-2 rounded bg-[var(--surface-0)] px-2 py-1">
                    <span className="truncate text-[var(--state-info)]">{entry.key}</span>
                    <span className="break-all text-[var(--text-normal)]">{entry.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      {message && <div className="mt-1 text-[10px] text-[var(--text-muted)]">{message}</div>}
      {pendingDelete && (
        <ConfirmDialog
          title={t("metadataProfile.deleteTitle")}
          message={t("metadataProfile.deleteMessage", { name: pendingDelete.name })}
          confirmLabel={t("common.delete")}
          cancelLabel={t("common.cancel")}
          variant="danger"
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
