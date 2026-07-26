import { create } from "zustand";
import type { ProtoImportSource } from "@/lib/proto-import-groups";
import { fetchProtoSources, type ProtoSourcesLoadStatus } from "@/lib/proto-source-api";

export type MethodType = "unary" | "server_streaming" | "client_streaming" | "bidi_streaming";

export interface ServiceMethod {
  serviceName: string;
  methodName: string;
  fullName: string;
  methodType: MethodType;
  inputTypeName: string;
  outputTypeName: string;
}

export interface ServiceDefinition {
  name: string;
  fullName: string;
  methods: ServiceMethod[];
}

export interface ProtoFile {
  path: string;
  projectId: string;
  projectName?: string;
  services: ServiceDefinition[];
}

export interface ProtoProject {
  id: string;
  name: string;
  createdAt: string;
}

export interface MetadataEntry {
  key: string;
  value: string;
  enabled: boolean;
}

export interface ChainStepConfig {
  projectId?: string;
  address: string;
  serviceName: string;
  methodName: string;
  body: string;
  manualInput?: boolean;
}

export interface Tab {
  id: string;
  title: string;
  address: string;
  method: ServiceMethod | null;
  requestBody: string;
  responseBody: string;
  metadata: MetadataEntry[];
  metadataJsonError: string | null;
  responseMetadata: MetadataEntry[];
  responseTrailers: MetadataEntry[];
  isLoading: boolean;
  elapsedMs: number | null;
  statusCode: string | null;
  useTls: boolean;
  certPath: string;
  keyPath: string;
  caPath: string;
  timeoutSec: number;
  timing: TimingDetail | null;
  chainSteps?: ChainStepConfig[];
  chainResults?: ChainStepResult[];
  projectId: string | null;
  collectionRequestId?: number;
  savedSnapshot?: string;
  isDirty?: boolean;
}

const DIRTY_TRACKED_KEYS = ["address", "requestBody", "metadata", "useTls", "certPath", "keyPath", "caPath"] as const;
const INITIAL_TAB_ADDRESS = "localhost:50051";

function buildSavedSnapshot(tab: Tab): string {
  const snapshot = {
    address: tab.address,
    requestBody: tab.requestBody,
    metadata: tab.metadata.filter((m) => m.enabled && m.key.trim()).map((m) => ({ key: m.key.trim(), value: m.value })),
    useTls: tab.useTls,
    certPath: tab.certPath,
    keyPath: tab.keyPath,
    caPath: tab.caPath,
  };
  return JSON.stringify(snapshot);
}

interface AppState {
  protoFiles: ProtoFile[];
  protoProjects: ProtoProject[];
  protoSourcesByProject: Record<string, ProtoImportSource[]>;
  protoSourcesStatus: Record<string, ProtoSourcesLoadStatus>;
  activeProjectId: string | null;
  tabs: Tab[];
  activeTabId: string | null;
  defaultAddress: string;
  sidebarWidth: number;

  addProtoFile: (file: ProtoFile) => void;
  removeProtoFile: (path: string, projectId?: string) => void;
  clearProtoFiles: () => void;
  setProtoProjects: (projects: ProtoProject[]) => void;
  setActiveProjectId: (projectId: string | null) => void;
  refreshProtoSources: (projectId: string) => Promise<void>;
  ensureProtoSources: (projectIds: string[]) => Promise<void>;
  clearProtoSourcesForProject: (projectId: string) => void;

  addTab: (method?: ServiceMethod) => string;
  removeTab: (id: string) => void;
  removeTabsByIds: (ids: string[]) => void;
  setActiveTab: (id: string) => void;
  updateTab: (id: string, updates: Partial<Tab>) => void;
  getActiveTab: () => Tab | undefined;
  reorderTabs: (fromIndex: number, toIndex: number) => void;
  markCollectionLoaded: (id: string, collectionRequestId: number) => void;
  markCollectionSaved: (id: string, collectionRequestId: number) => void;
  clearCollectionLink: (id: string) => void;
  loadDefaultAddress: () => Promise<void>;
  setDefaultAddress: (address: string) => Promise<void>;
  clearDefaultAddress: () => Promise<void>;

  setSidebarWidth: (width: number) => void;
}

let tabCounter = 0;

const protoSourcesInflight = new Map<string, Promise<void>>();

function createTab(method?: ServiceMethod): Tab {
  tabCounter++;
  return {
    id: `tab-${tabCounter}`,
    title: method?.serviceName && method?.methodName ? `${method.serviceName}/${method.methodName}` : "New Request",
    address: INITIAL_TAB_ADDRESS,
    method: method ?? null,
    requestBody: "{\n  \n}",
    responseBody: "",
    metadata: [],
    metadataJsonError: null,
    responseMetadata: [],
    responseTrailers: [],
    isLoading: false,
    elapsedMs: null,
    statusCode: null,
    useTls: false,
    certPath: "",
    keyPath: "",
    caPath: "",
    timeoutSec: 30,
    timing: null,
    projectId: null,
  };
}

function applyDefaultAddressToTab(tab: Tab, defaultAddress: string): string {
  const normalized = defaultAddress.trim();
  if (normalized) {
    tab.address = normalized;
  }
  return normalized;
}

function shouldHydrateInitialTabAddress(tab: Tab): boolean {
  return (
    tab.address === INITIAL_TAB_ADDRESS &&
    tab.method === null &&
    !tab.collectionRequestId &&
    tab.responseBody === "" &&
    tab.statusCode === null
  );
}

function loadDefaultAddressTls(tabId: string, address: string, get: () => AppState) {
  void window.go.main.App.GetAddressTLSSettings(address).then((settings) => {
    if (!settings) return;
    const current = get().tabs.find((t) => t.id === tabId);
    if (current?.address !== address) return;
    get().updateTab(tabId, {
      useTls: settings.useTls,
      certPath: settings.certPath,
      keyPath: settings.keyPath,
      caPath: settings.caPath,
    });
  }).catch(() => {
    // Keep the address even if TLS settings cannot be loaded.
  });
}

export const useAppStore = create<AppState>((set, get) => ({
  protoFiles: [],
  protoProjects: [],
  protoSourcesByProject: {},
  protoSourcesStatus: {},
  activeProjectId: null,
  tabs: [createTab()],
  activeTabId: "tab-1",
  defaultAddress: "",
  sidebarWidth: 280,

  addProtoFile: (file) => {
    const safeFile = { ...file, services: file.services ?? [] };
    safeFile.services = safeFile.services.map((s: any) => ({
      ...s,
      methods: s.methods ?? [],
    }));
    set((state) => ({
      protoFiles: [
        ...state.protoFiles.filter((f) => !(f.path === safeFile.path && f.projectId === safeFile.projectId)),
        safeFile,
      ],
    }));
  },

  removeProtoFile: (path, projectId) =>
    set((state) => ({
      protoFiles: state.protoFiles.filter((f) => !(f.path === path && (!projectId || f.projectId === projectId))),
    })),

  clearProtoFiles: () => set({ protoFiles: [] }),
  setProtoProjects: (projects) => set({ protoProjects: projects ?? [] }),
  setActiveProjectId: (projectId) => set({ activeProjectId: projectId }),

  refreshProtoSources: async (projectId) => {
    if (!projectId) return;
    const existing = protoSourcesInflight.get(projectId);
    if (existing) return existing;

    const task = (async () => {
      const hasCache = (get().protoSourcesByProject[projectId]?.length ?? 0) > 0;
      if (!hasCache) {
        set((state) => ({
          protoSourcesStatus: { ...state.protoSourcesStatus, [projectId]: "loading" },
        }));
      }
      try {
        const sources = await fetchProtoSources(projectId);
        set((state) => ({
          protoSourcesByProject: { ...state.protoSourcesByProject, [projectId]: sources },
          protoSourcesStatus: { ...state.protoSourcesStatus, [projectId]: "ready" },
        }));
      } catch {
        if (!hasCache) {
          set((state) => ({
            protoSourcesStatus: { ...state.protoSourcesStatus, [projectId]: "error" },
          }));
        }
      }
    })();

    protoSourcesInflight.set(projectId, task);
    try {
      await task;
    } finally {
      protoSourcesInflight.delete(projectId);
    }
  },

  ensureProtoSources: async (projectIds) => {
    const unique = [...new Set(projectIds.filter(Boolean))];
    const pending = unique.filter((id) => {
      const status = get().protoSourcesStatus[id];
      return status !== "ready" && status !== "loading";
    });
    await Promise.all(pending.map((id) => get().refreshProtoSources(id)));
  },

  clearProtoSourcesForProject: (projectId) =>
    set((state) => {
      const { [projectId]: _sources, ...protoSourcesByProject } = state.protoSourcesByProject;
      const { [projectId]: _status, ...protoSourcesStatus } = state.protoSourcesStatus;
      return { protoSourcesByProject, protoSourcesStatus };
    }),

  addTab: (method) => {
    const tab = createTab(method);
    const state = get();
    const active = state.tabs.find((t) => t.id === state.activeTabId);
    tab.projectId = active?.projectId ?? state.activeProjectId ?? null;
    const defaultAddress = applyDefaultAddressToTab(tab, state.defaultAddress);
    if (!defaultAddress && active) {
      tab.address = active.address;
      tab.useTls = active.useTls;
      tab.certPath = active.certPath;
      tab.keyPath = active.keyPath;
      tab.caPath = active.caPath;
    }
    set((state) => ({
      tabs: [...state.tabs, tab],
      activeTabId: tab.id,
    }));
    if (defaultAddress) {
      loadDefaultAddressTls(tab.id, defaultAddress, get);
    }
    return tab.id;
  },

  removeTab: (id) => {
    const fallbackTabs: Array<{ id: string; address: string }> = [];
    set((state) => {
      const newTabs = state.tabs.filter((t) => t.id !== id);
      if (newTabs.length === 0) {
        const tab = createTab();
        const defaultAddress = applyDefaultAddressToTab(tab, state.defaultAddress);
        if (defaultAddress) {
          fallbackTabs.push({ id: tab.id, address: defaultAddress });
        }
        return { tabs: [tab], activeTabId: tab.id };
      }
      const newActiveId =
        state.activeTabId === id
          ? newTabs[Math.min(state.tabs.findIndex((t) => t.id === id), newTabs.length - 1)]?.id
          : state.activeTabId;
      return { tabs: newTabs, activeTabId: newActiveId };
    });
    const fallbackTab = fallbackTabs[0];
    if (fallbackTab) {
      loadDefaultAddressTls(fallbackTab.id, fallbackTab.address, get);
    }
  },

  setActiveTab: (id) => set({ activeTabId: id }),

  updateTab: (id, updates) =>
    set((state) => ({
      tabs: state.tabs.map((t) => {
        if (t.id !== id) return t;
        const next = { ...t, ...updates };
        if (t.collectionRequestId !== undefined && t.savedSnapshot !== undefined) {
          const touched = DIRTY_TRACKED_KEYS.some((k) => k in updates);
          if (touched) {
            next.isDirty = buildSavedSnapshot(next) !== t.savedSnapshot;
          }
        }
        return next;
      }),
    })),

  getActiveTab: () => {
    const state = get();
    return state.tabs.find((t) => t.id === state.activeTabId);
  },

  markCollectionLoaded: (id, collectionRequestId) =>
    set((state) => ({
      tabs: state.tabs.map((t) => {
        if (t.id !== id) return t;
        return { ...t, collectionRequestId, savedSnapshot: buildSavedSnapshot(t), isDirty: false };
      }),
    })),

  markCollectionSaved: (id, collectionRequestId) =>
    set((state) => ({
      tabs: state.tabs.map((t) => {
        if (t.id !== id) return t;
        return { ...t, collectionRequestId, savedSnapshot: buildSavedSnapshot(t), isDirty: false };
      }),
    })),

  clearCollectionLink: (id) =>
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === id ? { ...t, collectionRequestId: undefined, savedSnapshot: undefined, isDirty: false } : t
      ),
    })),

  loadDefaultAddress: async () => {
    try {
      const address = await window.go.main.App.GetDefaultAddress();
      const defaultAddress = address ?? "";
      const hydratedTabIds: string[] = [];
      set((state) => ({
        defaultAddress,
        tabs: defaultAddress
          ? state.tabs.map((tab) => {
            if (!shouldHydrateInitialTabAddress(tab)) return tab;
            hydratedTabIds.push(tab.id);
            return { ...tab, address: defaultAddress };
          })
          : state.tabs,
      }));
      hydratedTabIds.forEach((tabId) => loadDefaultAddressTls(tabId, defaultAddress, get));
    } catch {
      set({ defaultAddress: "" });
    }
  },

  setDefaultAddress: async (address) => {
    const normalized = address.replace(/\s+/g, "");
    if (!normalized) return;
    await window.go.main.App.SetDefaultAddress(normalized);
    set({ defaultAddress: normalized });
  },

  clearDefaultAddress: async () => {
    await window.go.main.App.ClearDefaultAddress();
    set({ defaultAddress: "" });
  },

  removeTabsByIds: (ids) => {
    const fallbackTabs: Array<{ id: string; address: string }> = [];
    set((state) => {
      const idSet = new Set(ids);
      const newTabs = state.tabs.filter((t) => !idSet.has(t.id));
      if (newTabs.length === 0) {
        const tab = createTab();
        const defaultAddress = applyDefaultAddressToTab(tab, state.defaultAddress);
        if (defaultAddress) {
          fallbackTabs.push({ id: tab.id, address: defaultAddress });
        }
        return { tabs: [tab], activeTabId: tab.id };
      }
      let newActiveId = state.activeTabId;
      if (idSet.has(state.activeTabId ?? "")) {
        const activeIdx = state.tabs.findIndex((t) => t.id === state.activeTabId);
        let survivorId: string | undefined;
        for (let i = activeIdx; i < state.tabs.length; i++) {
          if (!idSet.has(state.tabs[i].id)) {
            survivorId = state.tabs[i].id;
            break;
          }
        }
        newActiveId = survivorId ?? newTabs[newTabs.length - 1].id;
      }
      return { tabs: newTabs, activeTabId: newActiveId };
    });
    const fallbackTab = fallbackTabs[0];
    if (fallbackTab) {
      loadDefaultAddressTls(fallbackTab.id, fallbackTab.address, get);
    }
  },

  reorderTabs: (fromIndex, toIndex) =>
    set((state) => {
      const newTabs = [...state.tabs];
      const [moved] = newTabs.splice(fromIndex, 1);
      newTabs.splice(toIndex, 0, moved);
      return { tabs: newTabs };
    }),

  setSidebarWidth: (width) => set({ sidebarWidth: width }),
}));
