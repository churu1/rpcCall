import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { X, Save, Plus, Trash2 } from "lucide-react";
import { type MetadataEntry, type Tab } from "@/store/app-store";
import {
  applyMetadataMappings,
  defaultMetadataKey,
  flattenJsonPaths,
  parseJsonBody,
} from "@/lib/metadata-profile";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";

interface Props {
  tab: Tab;
  onClose: () => void;
  onSaved?: () => void;
}

export function MetadataProfileDialog({ tab, onClose, onSaved }: Props) {
  const { t } = useTranslation();
  const payload = useMemo(() => parseJsonBody(tab.responseBody), [tab.responseBody]);
  const fields = useMemo(() => (payload ? flattenJsonPaths(payload) : []), [payload]);
  const [mappings, setMappings] = useState<MetadataMapping[]>(() =>
    fields.slice(0, 8).map((field) => ({
      path: field.path,
      key: defaultMetadataKey(field.path),
      template: "{{value}}",
      enabled: false,
    }))
  );
  const [profileName, setProfileName] = useState("");
  const [error, setError] = useState("");

  const metadata = useMemo<MetadataEntry[]>(
    () => (payload ? applyMetadataMappings(payload, mappings) : []),
    [payload, mappings]
  );

  const updateMapping = (index: number, updates: Partial<MetadataMapping>) => {
    setMappings((items) => items.map((item, i) => (i === index ? { ...item, ...updates } : item)));
  };

  const addMapping = () => {
    const first = fields[0];
    setMappings((items) => [
      ...items,
      {
        path: first?.path ?? "",
        key: first ? defaultMetadataKey(first.path) : "",
        template: "{{value}}",
        enabled: true,
      },
    ]);
  };

  const addAllMappings = () => {
    setMappings((items) => {
      const byPath = new Map(items.map((item) => [item.path, item]));
      const fieldPaths = new Set(fields.map((field) => field.path));
      const next = fields.map((field) => {
        const existing = byPath.get(field.path);
        return {
          path: field.path,
          key: existing?.key || defaultMetadataKey(field.path),
          template: existing?.template || "{{value}}",
          enabled: true,
        };
      });
      const custom = items.filter((item) => item.path && !fieldPaths.has(item.path));
      return [...next, ...custom];
    });
  };

  const save = async () => {
    const name = profileName.trim();
    if (!name) {
      setError(t("metadataProfile.nameRequired"));
      return;
    }
    if (!payload || metadata.length === 0) {
      setError(t("metadataProfile.noSelection"));
      return;
    }
    try {
      await window.go.main.App.SaveMetadataProfile({
        id: 0,
        address: tab.address,
        name,
        metadata: metadata.map(({ key, value }) => ({ key, value })),
        mappings,
        sourceRequest: {
          projectId: tab.projectId ?? "",
          address: tab.address,
          serviceName: tab.method?.serviceName ?? "",
          methodName: tab.method?.methodName ?? "",
          methodType: tab.method?.methodType ?? "unary",
          body: tab.requestBody,
          metadata: tab.metadata.filter((entry) => entry.enabled && entry.key).map(({ key, value }) => ({ key, value })),
          useTls: tab.useTls,
          certPath: tab.certPath,
          keyPath: tab.keyPath,
          caPath: tab.caPath,
          timeoutSec: tab.timeoutSec,
        },
        enabled: true,
        createdAt: "",
        updatedAt: "",
      });
      window.dispatchEvent(new CustomEvent("rpccall:metadata-profile-changed", { detail: { address: tab.address } }));
      onSaved?.();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  if (!payload) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
        <div className="w-[420px] rounded-xl border border-[var(--line-soft)] bg-[var(--surface-0)] shadow-xl">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--line-soft)]">
            <span className="text-sm font-semibold">{t("metadataProfile.title")}</span>
            <IconButton onClick={onClose} size="sm"><X size={14} /></IconButton>
          </div>
          <div className="p-4 text-xs text-[var(--state-error)]">{t("metadataProfile.invalidJson")}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="flex max-h-[82vh] w-[760px] flex-col rounded-xl border border-[var(--line-soft)] bg-[var(--surface-0)] shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--line-soft)]">
          <div>
            <div className="text-sm font-semibold">{t("metadataProfile.title")}</div>
            <div className="text-[11px] text-[var(--text-muted)]">{tab.address}</div>
          </div>
          <IconButton onClick={onClose} size="sm"><X size={14} /></IconButton>
        </div>

        <div className="border-b border-[var(--line-soft)] px-4 py-3">
          <label className="mb-1 block text-[11px] font-medium text-[var(--text-muted)]">
            {t("metadataProfile.profileName")}
          </label>
          <Input
            value={profileName}
            onChange={(e) => { setProfileName(e.target.value); setError(""); }}
            placeholder={t("metadataProfile.profileNamePlaceholder")}
            autoFocus
          />
          <div className="mt-1 text-[10px] text-[var(--text-muted)]">
            {t("metadataProfile.profileLimitHint")}
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[1fr_1.4fr] gap-3 overflow-hidden p-3">
          <div className="overflow-auto rounded-lg border border-[var(--line-soft)] bg-[var(--surface-1)]">
            <div className="sticky top-0 flex items-center justify-between gap-2 bg-[var(--surface-1)] px-3 py-2">
              <span className="text-[11px] font-medium text-[var(--text-muted)]">
                {t("metadataProfile.responseFields")}
              </span>
              <Button onClick={addAllMappings} size="sm" variant="ghost" className="h-6" disabled={fields.length === 0}>
                <Plus size={12} /> {t("metadataProfile.addAll")}
              </Button>
            </div>
            {fields.map((field) => (
              <button
                key={field.path}
                onClick={() => setMappings((items) => [...items, {
                  path: field.path,
                  key: defaultMetadataKey(field.path),
                  template: "{{value}}",
                  enabled: true,
                }])}
                className="flex w-full flex-col px-3 py-1.5 text-left hover:bg-[var(--surface-2)]"
              >
                <span className="text-[11px] text-[var(--state-info)]">{field.path}</span>
                <span className="truncate text-[10px] text-[var(--text-muted)]">{field.value}</span>
              </button>
            ))}
          </div>

          <div className="flex min-h-0 flex-col rounded-lg border border-[var(--line-soft)]">
            <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--line-soft)]">
              <span className="text-[11px] font-medium text-[var(--text-muted)]">{t("metadataProfile.mappings")}</span>
              <Button onClick={addMapping} size="sm" variant="ghost"><Plus size={12} /> {t("common.add")}</Button>
            </div>
            <div className="flex-1 overflow-auto p-2">
              {mappings.map((mapping, index) => (
                <div key={`${mapping.path}-${index}`} className="mb-2 grid grid-cols-[18px_1fr_1fr_1fr_28px] items-center gap-1">
                  <input
                    type="checkbox"
                    checked={mapping.enabled}
                    onChange={(e) => updateMapping(index, { enabled: e.target.checked })}
                  />
                  <Input dense value={mapping.path} onChange={(e) => updateMapping(index, { path: e.target.value })} placeholder="data.token" />
                  <Input dense value={mapping.key} onChange={(e) => updateMapping(index, { key: e.target.value })} placeholder="authorization" />
                  <Input dense value={mapping.template} onChange={(e) => updateMapping(index, { template: e.target.value })} placeholder="Bearer {{value}}" />
                  <IconButton
                    size="sm"
                    tone="danger"
                    onClick={() => setMappings((items) => items.filter((_, i) => i !== index))}
                  >
                    <Trash2 size={12} />
                  </IconButton>
                </div>
              ))}
            </div>
            <div className="border-t border-[var(--line-soft)] p-2">
              <div className="mb-1 text-[11px] text-[var(--text-muted)]">{t("metadataProfile.preview")}</div>
              <div className="max-h-24 overflow-auto rounded bg-[var(--surface-1)] p-2 font-[var(--font-mono)] text-[11px]">
                {metadata.length > 0 ? metadata.map((entry) => (
                  <div key={entry.key}><span className="text-[var(--state-info)]">{entry.key}</span>: {entry.value}</div>
                )) : <span className="text-[var(--text-muted)]">{t("metadataProfile.noSelection")}</span>}
              </div>
              {error && <div className="mt-1 text-[11px] text-[var(--state-error)]">{error}</div>}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--line-soft)] px-4 py-3">
          <Button onClick={onClose} variant="ghost">{t("common.cancel")}</Button>
          <Button onClick={save} variant="primary"><Save size={13} /> {t("metadataProfile.save")}</Button>
        </div>
      </div>
    </div>
  );
}
