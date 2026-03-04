import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "@/store/app-store";
import { IconButton } from "@/components/ui/IconButton";
import { SectionHeader } from "@/components/ui/SectionHeader";
import {
  ChevronRight,
  ChevronDown,
  FolderOpen,
  Plus,
  Trash2,
  FileText,
} from "lucide-react";

interface CollectionWithRequests {
  collection: AppCollection;
  requests: SavedRequest[];
}

export function CollectionPanel() {
  const { t } = useTranslation();
  const { addTab } = useAppStore();
  const [collections, setCollections] = useState<CollectionWithRequests[]>([]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const cols = (await window.go.main.App.ListCollections()) ?? [];
      const result: CollectionWithRequests[] = [];
      for (const c of cols) {
        const reqs = (await window.go.main.App.ListCollectionRequests(c.id)) ?? [];
        result.push({ collection: c, requests: reqs });
      }
      setCollections(result);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const handler = () => load();
    document.addEventListener("rpccall:collections-changed", handler);
    return () => document.removeEventListener("rpccall:collections-changed", handler);
  }, [load]);

  const toggle = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleNewCollection = async () => {
    const name = prompt(t("collections.collectionName"));
    if (!name?.trim()) return;
    try {
      await window.go.main.App.SaveCollection(name.trim());
    } catch { /* ignore */ }
    load();
  };

  const handleDeleteCollection = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    try {
      await window.go.main.App.DeleteCollection(id);
    } catch { /* ignore */ }
    load();
  };

  const handleDeleteRequest = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    try {
      await window.go.main.App.DeleteSavedRequest(id);
    } catch { /* ignore */ }
    load();
  };

  const handleLoadRequest = (req: SavedRequest) => {
    let metadata: { key: string; value: string; enabled: boolean }[] = [];
    try {
      const parsed = JSON.parse(req.metadata);
      if (Array.isArray(parsed)) {
        metadata = parsed.map((m: { key: string; value: string }) => ({
          key: m.key ?? "",
          value: m.value ?? "",
          enabled: true,
        }));
      }
    } catch { /* ignore */ }

    const method = {
      serviceName: req.serviceName,
      methodName: req.methodName,
      fullName: `${req.serviceName}/${req.methodName}`,
      methodType: req.methodType as "unary" | "server_streaming" | "client_streaming" | "bidi_streaming",
      inputTypeName: "",
      outputTypeName: "",
    };

    addTab(method);
    setTimeout(() => {
      const state = useAppStore.getState();
      const newTab = state.tabs.find((t) => t.id === state.activeTabId);
      if (newTab) {
        state.updateTab(newTab.id, {
          address: req.address,
          requestBody: req.requestBody,
          metadata,
          useTls: req.useTls,
          certPath: req.certPath,
          keyPath: req.keyPath,
          caPath: req.caPath,
        });
      }
    }, 0);
  };

  return (
    <div className="flex flex-col border-t border-[var(--line-soft)]">
      <SectionHeader
        title={t("collections.title")}
        right={(
          <IconButton
            onClick={handleNewCollection}
            size="sm"
            title={t("collections.newCollection")}
            aria-label={t("collections.newCollection")}
          >
            <Plus size={14} />
          </IconButton>
        )}
      />
      {loading && (
        <div className="px-3 py-1.5 text-[11px] text-[var(--text-muted)]">{t("collections.loading")}</div>
      )}
      <div className="flex flex-col pb-1">
        {collections.map(({ collection, requests }) => (
          <div key={collection.id} className="group">
            <div
              onClick={() => toggle(collection.id)}
              className="flex items-center gap-1.5 w-full px-3 py-1.5 text-xs hover:bg-[var(--surface-1)] cursor-pointer"
            >
              {expanded.has(collection.id) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <FolderOpen size={12} className="text-[var(--text-muted)]" />
              <span className="truncate flex-1 text-left text-[var(--text-normal)]">{collection.name}</span>
              <span className="text-[10px] text-[var(--text-muted)]">{requests.length}</span>
              <IconButton
                onClick={(e) => handleDeleteCollection(e, collection.id)}
                tone="danger"
                size="sm"
                className="opacity-0 group-hover:opacity-100 h-5 w-5 border-transparent bg-transparent"
                title={t("common.delete")}
              >
                <Trash2 size={11} />
              </IconButton>
            </div>
            {expanded.has(collection.id) && (
              <div className="flex flex-col">
                {requests.map((req) => (
                  <div
                    key={req.id}
                    onClick={() => handleLoadRequest(req)}
                    className="flex items-center gap-1.5 pl-8 pr-3 py-1 text-[11px] hover:bg-[var(--surface-1)] cursor-pointer group/req"
                  >
                    <FileText size={10} className="text-[var(--text-muted)] shrink-0" />
                    <span className="truncate flex-1 text-left text-[var(--text-normal)]">{req.name}</span>
                    <IconButton
                      onClick={(e) => handleDeleteRequest(e, req.id)}
                      tone="danger"
                      size="sm"
                      className="opacity-0 group-hover/req:opacity-100 h-5 w-5 border-transparent bg-transparent"
                      title={t("common.delete")}
                    >
                      <Trash2 size={11} />
                    </IconButton>
                  </div>
                ))}
                {requests.length === 0 && (
                  <div className="pl-8 pr-3 py-1.5 text-[10px] text-[var(--text-muted)]">
                    {t("collections.noRequests")}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {collections.length === 0 && !loading && (
          <div className="px-3 py-2 text-[10px] text-[var(--text-muted)]">
            {t("collections.noCollections")}
          </div>
        )}
      </div>
    </div>
  );
}
