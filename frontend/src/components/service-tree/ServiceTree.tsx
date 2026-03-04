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
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

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
        className="flex items-center gap-1 px-2 py-1 hover:bg-[var(--surface-1)] cursor-pointer text-xs ml-3"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <FolderOpen size={12} className="text-[var(--state-info)]" />
        <span className="truncate font-medium">{service.name}</span>
        <span className="text-[10px] text-[var(--text-muted)] ml-auto">
          {service.methods.length}
        </span>
      </div>
      {expanded && (
        <div className="ml-7">
          {service.methods.map((method) => (
            <div
              key={method.fullName}
              className="flex items-center gap-1.5 px-2 py-1 hover:bg-[var(--surface-1)] cursor-pointer text-xs"
              onClick={() => onMethodClick(method)}
            >
              <MethodTypeTag type={method.methodType} />
              <span className="truncate text-[var(--text-muted)]">
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
    <div className="border-b border-[var(--line-soft)]/50">
      <div
        className="flex items-center gap-1 px-2 py-1.5 hover:bg-[var(--surface-1)] cursor-pointer text-xs group/source"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <Package size={12} className="text-[var(--state-info)] shrink-0" />
        <span className="truncate font-medium" title={group.fullPath}>
          {group.displayName}
        </span>
        <span className="text-[10px] text-[var(--text-muted)] ml-auto shrink-0">
          {allServices.length}s/{group.totalMethods}m
        </span>
        {expanded && (
          <button
            className="opacity-0 group-hover/source:opacity-100 p-0.5 rounded hover:bg-[var(--surface-1)] text-[var(--text-muted)] hover:text-[var(--text-normal)] transition-opacity shrink-0"
            title={expandServices ? "收起所有方法" : "展开所有方法"}
            onClick={toggleAllServices}
          >
            <ChevronsUpDown size={12} />
          </button>
        )}
        <button
          className="opacity-0 group-hover/source:opacity-100 p-0.5 rounded hover:bg-[var(--surface-1)] text-[var(--text-muted)] hover:text-[var(--state-error)] transition-opacity shrink-0"
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
    <div className="flex flex-col h-full bg-[var(--surface-1)]">
      <div className="px-3 py-2 border-b border-[var(--line-soft)] space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 min-w-0 flex-1 pr-2">
            <div className="relative flex-1 min-w-[96px]">
              <select
                value={activeProjectId ?? protoProjects[0]?.id ?? ""}
                onChange={(e) => {
                  const nextProjectId = e.target.value || null;
                  setActiveProjectId(nextProjectId);
                  if (activeTabId && nextProjectId) {
                    updateTab(activeTabId, { projectId: nextProjectId });
                  }
                }}
                className="ui-input h-8 w-full pr-7 appearance-none"
                disabled={protoProjects.length === 0}
              >
                {protoProjects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <ChevronDown
                size={12}
                className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
              />
            </div>
            <IconButton
              className="h-8 w-7 shrink-0 relative z-10"
              title={t("decode.newProject")}
              onClick={() => {
                setShowCreateProject((v) => !v);
                setError(null);
              }}
            >
              <Plus size={12} />
            </IconButton>
          </div>
          <div className="flex items-center gap-1 shrink-0 pl-2 border-l border-[var(--line-soft)]">
            <div className="h-4 w-4 flex items-center justify-center">
              {loading && <Loader2 size={14} className="animate-spin text-[var(--state-info)]" />}
            </div>
            <IconButton
              size="sm"
              className="h-7 w-7 shrink-0 border-[var(--line-soft)] bg-[var(--surface-0)]"
              title={t("services.importFile")}
              onClick={handleImportFile}
              disabled={loading}
            >
              <Import size={12} />
            </IconButton>
            <IconButton
              size="sm"
              className="h-7 w-7 shrink-0 border-[var(--line-soft)] bg-[var(--surface-0)]"
              title={t("services.importDir")}
              onClick={handleImportDir}
              disabled={loading}
            >
              <FolderSearch size={12} />
            </IconButton>
            <IconButton
              size="sm"
              className="h-7 w-7 shrink-0 border-[var(--line-soft)] bg-[var(--surface-0)]"
              title={t("services.reflection")}
              onClick={handleReflection}
              disabled={loading}
            >
              <Wifi size={12} />
            </IconButton>
            {visibleFiles.length > 0 && (
              <>
                <IconButton
                  size="sm"
                  className="h-7 w-7 shrink-0 border-[var(--line-soft)] bg-[var(--surface-0)]"
                  title={t("services.reload")}
                  onClick={handleReload}
                  disabled={loading}
                >
                  <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
                </IconButton>
                <IconButton
                  size="sm"
                  tone="danger"
                  className="h-7 w-7 shrink-0 border-[var(--line-soft)] bg-[var(--surface-0)]"
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
                  <Trash2 size={12} />
                </IconButton>
              </>
            )}
          </div>
        </div>
        {showCreateProject && (
          <div className="flex items-center gap-1">
            <Input
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateProject();
                if (e.key === "Escape") {
                  setShowCreateProject(false);
                  setNewProjectName("");
                }
              }}
              className="h-7 flex-1"
              placeholder={t("decode.newProjectName")}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
            />
            <Button
              variant="secondary"
              size="sm"
              className="h-7 w-7 px-0"
              onClick={handleCreateProject}
              disabled={!newProjectName.trim() || creatingProject}
              title={t("common.save")}
            >
              {creatingProject ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="h-7 w-7 px-0"
              onClick={() => {
                setShowCreateProject(false);
                setNewProjectName("");
              }}
              title={t("common.cancel")}
            >
              <X size={12} />
            </Button>
          </div>
        )}
      </div>

      {error && (
        <div className="px-3 py-1.5 text-[10px] text-[var(--state-error)] bg-[var(--state-error)]/10 border-b">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)] text-xs px-4 text-center gap-2">
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
