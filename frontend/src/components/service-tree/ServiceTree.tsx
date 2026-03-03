import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore, type ProtoFile, type ServiceDefinition, type ServiceMethod } from "@/store/app-store";
import { cn } from "@/lib/utils";
import {
  ChevronRight,
  ChevronDown,
  ChevronsUpDown,
  Plus,
  Check,
  FolderOpen,
  Package,
  Import,
  FolderSearch,
  Wifi,
  Trash2,
  Loader2,
  X,
  RefreshCw,
} from "lucide-react";

function MethodTypeTag({ type }: { type: string }) {
  const colors: Record<string, string> = {
    unary: "text-[var(--color-method-unary)]",
    server_streaming: "text-[var(--color-method-server-stream)]",
    client_streaming: "text-[var(--color-method-client-stream)]",
    bidi_streaming: "text-[var(--color-method-bidi-stream)]",
  };
  const labels: Record<string, string> = {
    unary: "U",
    server_streaming: "SS",
    client_streaming: "CS",
    bidi_streaming: "BD",
  };
  return (
    <span className={cn("text-[10px] font-mono font-bold w-5 shrink-0", colors[type])}>
      {labels[type] ?? "?"}
    </span>
  );
}

function ServiceNode({
  service,
  onMethodClick,
  defaultExpanded = false,
}: {
  service: ServiceDefinition;
  onMethodClick: (method: ServiceMethod) => void;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div>
      <div
        className="flex items-center gap-1 px-2 py-1 hover:bg-[var(--color-secondary)] cursor-pointer text-xs ml-3"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <FolderOpen size={12} className="text-[var(--color-primary)]" />
        <span className="truncate font-medium">{service.name}</span>
        <span className="text-[10px] text-[var(--color-muted-foreground)] ml-auto">
          {service.methods.length}
        </span>
      </div>
      {expanded && (
        <div className="ml-7">
          {service.methods.map((method) => (
            <div
              key={method.fullName}
              className="flex items-center gap-1.5 px-2 py-1 hover:bg-[var(--color-secondary)] cursor-pointer text-xs"
              onClick={() => onMethodClick(method)}
            >
              <MethodTypeTag type={method.methodType} />
              <span className="truncate text-[var(--color-muted-foreground)]">
                {method.methodName}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface ProtoGroup {
  groupKey: string;
  displayName: string;
  fullPath: string;
  files: ProtoFile[];
  totalMethods: number;
}

function deriveGroupKey(path: string): string {
  if (path.startsWith("reflection://")) return path;
  const parts = path.replace(/\\/g, "/").split("/");
  const fileName = parts[parts.length - 1];
  if (fileName.endsWith(".proto")) {
    return parts.slice(0, -1).join("/");
  }
  return path;
}

function deriveDisplayName(groupKey: string): string {
  if (groupKey.startsWith("reflection://")) {
    return groupKey.replace("reflection://", "reflection: ");
  }
  const parts = groupKey.replace(/\\/g, "/").split("/");
  const last = parts[parts.length - 1];
  const parent = parts[parts.length - 2];
  return parent ? `${parent}/${last}` : last;
}

function ProtoGroupNode({
  group,
  onMethodClick,
  onRemove,
}: {
  group: ProtoGroup;
  onMethodClick: (method: ServiceMethod) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [expandServices, setExpandServices] = useState(false);
  const [expandKey, setExpandKey] = useState(0);
  const allServices = group.files.flatMap((f) => f.services ?? []);

  const toggleAllServices = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandServices((prev) => !prev);
    setExpandKey((k) => k + 1);
  }, []);

  return (
    <div className="border-b border-[var(--color-border)]/50">
      <div
        className="flex items-center gap-1 px-2 py-1.5 hover:bg-[var(--color-secondary)] cursor-pointer text-xs group/source"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <Package size={12} className="text-[var(--color-primary)] shrink-0" />
        <span className="truncate font-medium" title={group.fullPath}>
          {group.displayName}
        </span>
        <span className="text-[10px] text-[var(--color-muted-foreground)] ml-auto shrink-0">
          {allServices.length}s/{group.totalMethods}m
        </span>
        {expanded && (
          <button
            className="opacity-0 group-hover/source:opacity-100 p-0.5 rounded hover:bg-[var(--color-muted)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-opacity shrink-0"
            title={expandServices ? "收起所有方法" : "展开所有方法"}
            onClick={toggleAllServices}
          >
            <ChevronsUpDown size={12} />
          </button>
        )}
        <button
          className="opacity-0 group-hover/source:opacity-100 p-0.5 rounded hover:bg-[var(--color-muted)] text-[var(--color-muted-foreground)] hover:text-[var(--color-destructive)] transition-opacity shrink-0"
          title="移除此项目"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <X size={12} />
        </button>
      </div>
      {expanded && (
        <div>
          {allServices.map((service) => (
            <ServiceNode
              key={`${service.fullName}-${expandKey}`}
              service={service}
              onMethodClick={onMethodClick}
              defaultExpanded={expandServices}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ServiceTree() {
  const { t } = useTranslation();
  const {
    protoFiles,
    protoProjects,
    activeProjectId,
    setProtoProjects,
    setActiveProjectId,
    addProtoFile,
    removeProtoFile,
    addTab,
    updateTab,
    activeTabId,
    tabs,
  } =
    useAppStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);
  const loadedRef = useRef(false);
  const loadedProjectsRef = useRef<Set<string>>(new Set());
  const loadingProjectRef = useRef<string | null>(null);
  const handlersRef = useRef<{
    handleImportFile: () => void;
    handleImportDir: () => void;
    handleReflection: () => void;
    handleReload: () => void;
  }>({ handleImportFile: () => {}, handleImportDir: () => {}, handleReflection: () => {}, handleReload: () => {} });

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    (async () => {
      try {
        setLoading(true);
        const projects = (await window.go.main.App.ListProtoProjects()) || [];
        setProtoProjects(projects as any);
        const initialProjectId = activeProjectId || projects[0]?.id || null;
        setActiveProjectId(initialProjectId);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    const onImportFile = () => handlersRef.current.handleImportFile();
    const onImportDir = () => handlersRef.current.handleImportDir();
    const onReflection = () => handlersRef.current.handleReflection();
    const onClearProtos = () => {
      if (!activeProjectId) return;
      loadedProjectsRef.current.delete(activeProjectId);
      const visible = protoFiles.filter((f) => f.projectId === activeProjectId);
      for (const f of visible) {
        removeProtoFile(f.path, f.projectId);
      }
      window.go.main.App.ClearProtoSources(activeProjectId).catch(() => {});
    };
    const onReloadProtos = () => handlersRef.current.handleReload();
    document.addEventListener("rpccall:import-file", onImportFile);
    document.addEventListener("rpccall:import-dir", onImportDir);
    document.addEventListener("rpccall:reflection", onReflection);
    document.addEventListener("rpccall:clear-protos", onClearProtos);
    document.addEventListener("rpccall:reload-protos", onReloadProtos);
    return () => {
      document.removeEventListener("rpccall:import-file", onImportFile);
      document.removeEventListener("rpccall:import-dir", onImportDir);
      document.removeEventListener("rpccall:reflection", onReflection);
      document.removeEventListener("rpccall:clear-protos", onClearProtos);
      document.removeEventListener("rpccall:reload-protos", onReloadProtos);
    };
  }, [activeProjectId, protoFiles, removeProtoFile]);

  const visibleFiles = useMemo(
    () => protoFiles.filter((f) => (activeProjectId ? f.projectId === activeProjectId : false)),
    [protoFiles, activeProjectId]
  );

  const groups = useMemo<ProtoGroup[]>(() => {
    const map = new Map<string, ProtoFile[]>();
    for (const file of visibleFiles) {
      const key = deriveGroupKey(file.path);
      const list = map.get(key) || [];
      list.push(file);
      map.set(key, list);
    }
    return Array.from(map.entries()).map(([key, files]) => ({
      groupKey: key,
      displayName: deriveDisplayName(key),
      fullPath: key,
      files,
      totalMethods: files.reduce((sum, f) => sum + (f.services ?? []).reduce((s, svc) => s + (svc.methods?.length ?? 0), 0), 0),
    }));
  }, [visibleFiles]);

  useEffect(() => {
    if (!activeProjectId) return;
    if (loadedProjectsRef.current.has(activeProjectId)) return;
    if (loadingProjectRef.current === activeProjectId) return;
    (async () => {
      loadingProjectRef.current = activeProjectId;
      setLoading(true);
      try {
        const files = await window.go.main.App.LoadSavedProtos(activeProjectId);
        (files || []).forEach((f: any) => addProtoFile(f));
        loadedProjectsRef.current.add(activeProjectId);
      } catch {
        // ignore
      } finally {
        loadingProjectRef.current = null;
        setLoading(false);
      }
    })();
  }, [activeProjectId]);

  useEffect(() => {
    const tab = tabs.find((t) => t.id === activeTabId);
    if (tab?.projectId) {
      setActiveProjectId(tab.projectId);
    }
  }, [activeTabId]);

  useEffect(() => {
    if (!activeProjectId || !activeTabId) return;
    const tab = tabs.find((t) => t.id === activeTabId);
    if (tab && !tab.projectId) {
      updateTab(tab.id, { projectId: activeProjectId });
    }
  }, [activeProjectId, activeTabId, tabs, updateTab]);

  const handleMethodClick = async (method: ServiceMethod) => {
    if (!activeProjectId) return;
    const tabId = addTab(method);
    updateTab(tabId, { projectId: activeProjectId });
    try {
      const template = await window.go.main.App.GetMethodTemplate(
        activeProjectId,
        method.serviceName,
        method.methodName
      );
      if (template) {
        updateTab(tabId, { requestBody: template });
      }
    } catch {
      // template generation failed
    }
  };

  const handleRemoveGroup = (group: ProtoGroup) => {
    for (const file of group.files) {
      removeProtoFile(file.path, file.projectId);
    }
    if (!activeProjectId) return;
    window.go.main.App.ListProtoSources(activeProjectId).then((sources) => {
      if (!sources) return;
      for (const src of sources) {
        const srcKey = deriveGroupKey(src.path);
        if (srcKey === group.groupKey || group.files.some((f) => f.path === src.path)) {
          window.go.main.App.DeleteProtoSource(src.id).catch(() => {});
        }
      }
    }).catch(() => {});
  };

  const handleImportFile = async () => {
    if (!activeProjectId) {
      setError(t("decode.selectProjectFirst"));
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const files = await window.go.main.App.OpenProtoFileDialog(activeProjectId);
      if (files) {
        files.forEach((f: any) => addProtoFile(f));
      }
    } catch (e: any) {
      setError(typeof e === "string" ? e : e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleImportDir = async () => {
    if (!activeProjectId) {
      setError(t("decode.selectProjectFirst"));
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const files = await window.go.main.App.OpenProtoDirDialog(activeProjectId);
      if (files) {
        files.forEach((f: any) => addProtoFile(f));
      }
    } catch (e: any) {
      setError(typeof e === "string" ? e : e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleReflection = async () => {
    if (!activeProjectId) {
      setError(t("decode.selectProjectFirst"));
      return;
    }
    const tab = tabs.find((t) => t.id === activeTabId);
    const address = tab?.address || "localhost:50051";
    setError(null);
    setLoading(true);
    try {
      const services = await window.go.main.App.ListServicesViaReflection(address);
      if (services && services.length > 0) {
        addProtoFile({
          path: `reflection://${address}`,
          projectId: activeProjectId,
          services: services,
        });
      } else {
        setError("No services found via reflection");
      }
    } catch (e: any) {
      setError(typeof e === "string" ? e : e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleReload = async () => {
    if (!activeProjectId) return;
    setError(null);
    setLoading(true);
    try {
      loadedProjectsRef.current.delete(activeProjectId);
      const files = await window.go.main.App.LoadSavedProtos(activeProjectId);
      if (files && files.length > 0) {
        files.forEach((f: any) => addProtoFile(f));
      }
      loadedProjectsRef.current.add(activeProjectId);
    } catch (e: any) {
      setError(typeof e === "string" ? e : e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  handlersRef.current.handleImportFile = handleImportFile;
  handlersRef.current.handleImportDir = handleImportDir;
  handlersRef.current.handleReflection = handleReflection;
  handlersRef.current.handleReload = handleReload;

  const handleCreateProject = async () => {
    const name = newProjectName.trim();
    if (!name || creatingProject) return;
    try {
      setCreatingProject(true);
      const created = await window.go.main.App.CreateProtoProject(name);
      if (!created) return;
      setProtoProjects([...(protoProjects || []), created as any]);
      setActiveProjectId((created as any).id || null);
      setNewProjectName("");
      setShowCreateProject(false);
      setError(null);
    } catch (e: any) {
      setError(typeof e === "string" ? e : e?.message || String(e));
    } finally {
      setCreatingProject(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="text-xs font-medium uppercase tracking-wider text-[var(--color-muted-foreground)] shrink-0">
              {t("services.title")}
            </span>
            <div className="flex items-center gap-1 min-w-0 flex-1">
              <select
                value={activeProjectId ?? protoProjects[0]?.id ?? ""}
                onChange={(e) => {
                  const nextProjectId = e.target.value || null;
                  setActiveProjectId(nextProjectId);
                  if (activeTabId && nextProjectId) {
                    updateTab(activeTabId, { projectId: nextProjectId });
                  }
                }}
                className="h-8 w-full min-w-0 bg-[var(--color-secondary)] border border-[var(--color-input)] rounded px-2 text-xs"
                disabled={protoProjects.length === 0}
              >
                {protoProjects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <button
                className="h-8 w-7 shrink-0 rounded border border-[var(--color-input)] hover:bg-[var(--color-secondary)] flex items-center justify-center"
                title={t("decode.newProject")}
                onClick={() => {
                  setShowCreateProject((v) => !v);
                  setError(null);
                }}
              >
                <Plus size={12} />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-0.5">
            {loading && <Loader2 size={14} className="animate-spin text-[var(--color-primary)]" />}
            <button
              className="p-1 hover:bg-[var(--color-secondary)] rounded text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
              title={t("services.importFile")}
              onClick={handleImportFile}
              disabled={loading}
            >
              <Import size={14} />
            </button>
            <button
              className="p-1 hover:bg-[var(--color-secondary)] rounded text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
              title={t("services.importDir")}
              onClick={handleImportDir}
              disabled={loading}
            >
              <FolderSearch size={14} />
            </button>
            <button
              className="p-1 hover:bg-[var(--color-secondary)] rounded text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
              title={t("services.reflection")}
              onClick={handleReflection}
              disabled={loading}
            >
              <Wifi size={14} />
            </button>
            {visibleFiles.length > 0 && (
              <>
                <button
                  className="p-1 hover:bg-[var(--color-secondary)] rounded text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
                  title={t("services.reload")}
                  onClick={handleReload}
                  disabled={loading}
                >
                  <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                </button>
                <button
                  className="p-1 hover:bg-[var(--color-secondary)] rounded text-[var(--color-muted-foreground)] hover:text-[var(--color-destructive)]"
                  title={t("services.clearAll")}
                  onClick={() => {
                    if (!activeProjectId) return;
                    loadedProjectsRef.current.delete(activeProjectId);
                    const visible = protoFiles.filter((f) => f.projectId === activeProjectId);
                    for (const f of visible) {
                      removeProtoFile(f.path, f.projectId);
                    }
                    window.go.main.App.ClearProtoSources(activeProjectId).catch(() => {});
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </>
            )}
          </div>
        </div>
        {showCreateProject && (
          <div className="flex items-center gap-1">
            <input
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateProject();
                if (e.key === "Escape") {
                  setShowCreateProject(false);
                  setNewProjectName("");
                }
              }}
              className="h-7 flex-1 bg-[var(--color-secondary)] border border-[var(--color-input)] rounded px-2 text-xs"
              placeholder={t("decode.newProjectName")}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
            />
            <button
              className="h-7 w-7 rounded border border-[var(--color-input)] hover:bg-[var(--color-secondary)] flex items-center justify-center disabled:opacity-50"
              onClick={handleCreateProject}
              disabled={!newProjectName.trim() || creatingProject}
              title={t("common.save")}
            >
              {creatingProject ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
            </button>
            <button
              className="h-7 w-7 rounded border border-[var(--color-input)] hover:bg-[var(--color-secondary)] flex items-center justify-center"
              onClick={() => {
                setShowCreateProject(false);
                setNewProjectName("");
              }}
              title={t("common.cancel")}
            >
              <X size={12} />
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="px-3 py-1.5 text-[10px] text-[var(--color-destructive)] bg-[var(--color-destructive)]/10 border-b">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--color-muted-foreground)] text-xs px-4 text-center gap-2">
            <FolderOpen size={32} className="opacity-30" />
            <p>{t("services.noServices")}</p>
          </div>
        ) : (
          groups.map((group) => (
            <ProtoGroupNode
              key={group.groupKey}
              group={group}
              onMethodClick={handleMethodClick}
              onRemove={() => handleRemoveGroup(group)}
            />
          ))
        )}
      </div>
    </div>
  );
}
