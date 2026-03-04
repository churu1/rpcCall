import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "@/store/app-store";
import { X, Save, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { IconButton } from "@/components/ui/IconButton";

interface Props {
  onClose: () => void;
}

export function SaveRequestDialog({ onClose }: Props) {
  const { t } = useTranslation();
  const { activeTabId, tabs } = useAppStore();
  const tab = tabs.find((t) => t.id === activeTabId);
  const [collections, setCollections] = useState<AppCollection[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<number>(0);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [requestName, setRequestName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const cols = (await window.go.main.App.ListCollections()) ?? [];
      setCollections(cols);
      if (cols.length > 0) setSelectedCollectionId(cols[0].id);
    })();
  }, []);

  useEffect(() => {
    if (tab?.method) {
      setRequestName(`${tab.method.serviceName}/${tab.method.methodName}`.replace(/^\//, ""));
    }
  }, [tab]);

  const handleSave = async () => {
    if (!tab || !requestName.trim()) return;
    setSaving(true);
    try {
      let collId = selectedCollectionId;
      if (newCollectionName.trim()) {
        const col = await window.go.main.App.SaveCollection(newCollectionName.trim());
        if (col) collId = col.id;
      }
      if (!collId) {
        setSaving(false);
        return;
      }

      const metadataJson = JSON.stringify(
        tab.metadata
          .filter((m) => m.enabled)
          .map((m) => ({ key: m.key, value: m.value }))
      );

      await window.go.main.App.SaveRequestToCollection({
        id: 0,
        collectionId: collId,
        name: requestName.trim(),
        address: tab.address,
        serviceName: tab.method?.serviceName ?? "",
        methodName: tab.method?.methodName ?? "",
        methodType: tab.method?.methodType ?? "unary",
        requestBody: tab.requestBody,
        metadata: metadataJson,
        useTls: tab.useTls,
        certPath: tab.certPath,
        keyPath: tab.keyPath,
        caPath: tab.caPath,
        createdAt: "",
      });
      document.dispatchEvent(new CustomEvent("rpccall:collections-changed"));
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-[var(--surface-0)] border border-[var(--line-soft)] rounded-lg shadow-[var(--elevation-2)] w-[420px] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--line-soft)]">
          <h3 className="text-sm font-medium">{t("saveRequest.title")}</h3>
          <IconButton size="sm" className="border-0 bg-transparent" onClick={onClose}>
            <X size={14} />
          </IconButton>
        </div>
        <div className="p-4 flex flex-col gap-3">
          <div>
            <label className="text-[10px] text-[var(--text-muted)] mb-1 block">{t("saveRequest.requestName")}</label>
            <Input
              value={requestName}
              onChange={(e) => setRequestName(e.target.value)}
              className="w-full"
              placeholder={t("saveRequest.placeholder")}
              autoFocus
            />
          </div>
          <div>
            <label className="text-[10px] text-[var(--text-muted)] mb-1 block">{t("saveRequest.collection")}</label>
            {collections.length > 0 ? (
              <Select
                value={selectedCollectionId}
                onChange={(e) => {
                  setSelectedCollectionId(Number(e.target.value));
                  setNewCollectionName("");
                }}
                className="w-full"
              >
                {collections.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            ) : (
              <div className="text-[10px] text-[var(--text-muted)] mb-1">{t("saveRequest.noCollections")}</div>
            )}
          </div>
          <div>
            <label className="text-[10px] text-[var(--text-muted)] mb-1 flex items-center gap-1">
              <Plus size={10} /> {t("saveRequest.orCreateNew")}
            </label>
            <Input
              value={newCollectionName}
              onChange={(e) => setNewCollectionName(e.target.value)}
              className="w-full"
              placeholder={t("saveRequest.newCollectionPlaceholder")}
            />
          </div>
          <Button
            onClick={handleSave}
            disabled={saving || !requestName.trim()}
            variant="primary"
            className="mt-1"
          >
            <Save size={12} /> {saving ? t("saveRequest.saving") : t("saveRequest.save")}
          </Button>
        </div>
      </div>
    </div>
  );
}
