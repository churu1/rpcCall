import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "@/store/app-store";
import { X, Save, Plus } from "lucide-react";

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
      <div className="bg-[var(--color-card)] border rounded-lg shadow-xl w-[420px] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="text-sm font-medium">{t("saveRequest.title")}</h3>
          <button onClick={onClose} className="p-1 hover:bg-[var(--color-secondary)] rounded">
            <X size={14} />
          </button>
        </div>
        <div className="p-4 flex flex-col gap-3">
          <div>
            <label className="text-[10px] text-[var(--color-muted-foreground)] mb-1 block">{t("saveRequest.requestName")}</label>
            <input
              value={requestName}
              onChange={(e) => setRequestName(e.target.value)}
              className="w-full bg-[var(--color-secondary)] text-xs px-2 py-1.5 rounded border border-[var(--color-input)] focus:outline-none focus:ring-1 focus:ring-[var(--color-ring)]"
              placeholder={t("saveRequest.placeholder")}
              autoFocus
            />
          </div>
          <div>
            <label className="text-[10px] text-[var(--color-muted-foreground)] mb-1 block">{t("saveRequest.collection")}</label>
            {collections.length > 0 ? (
              <select
                value={selectedCollectionId}
                onChange={(e) => {
                  setSelectedCollectionId(Number(e.target.value));
                  setNewCollectionName("");
                }}
                className="w-full bg-[var(--color-secondary)] text-xs px-2 py-1.5 rounded border border-[var(--color-input)] focus:outline-none focus:ring-1 focus:ring-[var(--color-ring)]"
              >
                {collections.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            ) : (
              <div className="text-[10px] text-[var(--color-muted-foreground)] mb-1">{t("saveRequest.noCollections")}</div>
            )}
          </div>
          <div>
            <label className="text-[10px] text-[var(--color-muted-foreground)] mb-1 flex items-center gap-1">
              <Plus size={10} /> {t("saveRequest.orCreateNew")}
            </label>
            <input
              value={newCollectionName}
              onChange={(e) => setNewCollectionName(e.target.value)}
              className="w-full bg-[var(--color-secondary)] text-xs px-2 py-1.5 rounded border border-[var(--color-input)] focus:outline-none focus:ring-1 focus:ring-[var(--color-ring)]"
              placeholder={t("saveRequest.newCollectionPlaceholder")}
            />
          </div>
          <button
            onClick={handleSave}
            disabled={saving || !requestName.trim()}
            className="flex items-center justify-center gap-1 text-xs px-3 py-2 bg-[var(--color-primary)] text-white rounded hover:bg-[var(--color-primary)]/80 disabled:opacity-50 mt-1"
          >
            <Save size={12} /> {saving ? t("saveRequest.saving") : t("saveRequest.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
