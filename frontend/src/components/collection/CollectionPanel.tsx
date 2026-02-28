import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "@/store/app-store";
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
    <div className="flex flex-col border-t">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-[10px] font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wider">
          {t("collections.title")}
        </span>
        <button
          onClick={handleNewCollection}
          className="p-0.5 hover:bg-[var(--color-secondary)] rounded text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
          title={t("collections.newCollection")}
        >
          <Plus size={12} />
        </button>
      </div>
      {loading && (
        <div className="px-3 py-1 text-[10px] text-[var(--color-muted-foreground)]">{t("collections.loading")}</div>
      )}
      <div className="flex flex-col">
        {collections.map(({ collection, requests }) => (
          <div key={collection.id}>
            <button
              onClick={() => toggle(collection.id)}
              className="flex items-center gap-1.5 w-full px-3 py-1.5 text-xs hover:bg-[var(--color-secondary)] group"
            >
              {expanded.has(collection.id) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <FolderOpen size={12} className="text-[var(--color-muted-foreground)]" />
              <span className="truncate flex-1 text-left">{collection.name}</span>
              <span className="text-[10px] text-[var(--color-muted-foreground)]">{requests.length}</span>
              <button
                onClick={(e) => handleDeleteCollection(e, collection.id)}
                className="hidden group-hover:block p-0.5 hover:text-[var(--color-destructive)]"
              >
                <Trash2 size={10} />
              </button>
            </button>
            {expanded.has(collection.id) && (
              <div className="flex flex-col">
                {requests.map((req) => (
                  <button
                    key={req.id}
                    onClick={() => handleLoadRequest(req)}
                    className="flex items-center gap-1.5 pl-8 pr-3 py-1 text-[11px] hover:bg-[var(--color-secondary)] group/req"
                  >
                    <FileText size={10} className="text-[var(--color-muted-foreground)] shrink-0" />
                    <span className="truncate flex-1 text-left">{req.name}</span>
                    <button
                      onClick={(e) => handleDeleteRequest(e, req.id)}
                      className="hidden group-hover/req:block p-0.5 hover:text-[var(--color-destructive)]"
                    >
                      <Trash2 size={10} />
                    </button>
                  </button>
                ))}
                {requests.length === 0 && (
                  <div className="pl-8 pr-3 py-1 text-[10px] text-[var(--color-muted-foreground)]">
                    {t("collections.noRequests")}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {collections.length === 0 && !loading && (
          <div className="px-3 py-2 text-[10px] text-[var(--color-muted-foreground)]">
            {t("collections.noCollections")}
          </div>
        )}
      </div>
    </div>
  );
}
