import { create } from "zustand";

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
  services: ServiceDefinition[];
}

export interface MetadataEntry {
  key: string;
  value: string;
  enabled: boolean;
}

export interface Tab {
  id: string;
  title: string;
  address: string;
  method: ServiceMethod | null;
  requestBody: string;
  responseBody: string;
  metadata: MetadataEntry[];
  responseMetadata: MetadataEntry[];
  responseTrailers: MetadataEntry[];
  isLoading: boolean;
  elapsedMs: number | null;
  statusCode: string | null;
  useTls: boolean;
  certPath: string;
  keyPath: string;
  caPath: string;
  timing: TimingDetail | null;
}

interface AppState {
  protoFiles: ProtoFile[];
  tabs: Tab[];
  activeTabId: string | null;
  sidebarWidth: number;

  addProtoFile: (file: ProtoFile) => void;
  removeProtoFile: (path: string) => void;
  clearProtoFiles: () => void;

  addTab: (method?: ServiceMethod) => string;
  removeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateTab: (id: string, updates: Partial<Tab>) => void;
  getActiveTab: () => Tab | undefined;
  reorderTabs: (fromIndex: number, toIndex: number) => void;

  setSidebarWidth: (width: number) => void;
}

let tabCounter = 0;

function createTab(method?: ServiceMethod): Tab {
  tabCounter++;
  return {
    id: `tab-${tabCounter}`,
    title: method ? `${method.serviceName}/${method.methodName}` : "New Request",
    address: "localhost:50051",
    method: method ?? null,
    requestBody: "{\n  \n}",
    responseBody: "",
    metadata: [],
    responseMetadata: [],
    responseTrailers: [],
    isLoading: false,
    elapsedMs: null,
    statusCode: null,
    useTls: false,
    certPath: "",
    keyPath: "",
    caPath: "",
    timing: null,
  };
}

export const useAppStore = create<AppState>((set, get) => ({
  protoFiles: [],
  tabs: [createTab()],
  activeTabId: "tab-1",
  sidebarWidth: 280,

  addProtoFile: (file) => {
    const safeFile = { ...file, services: file.services ?? [] };
    safeFile.services = safeFile.services.map((s: any) => ({
      ...s,
      methods: s.methods ?? [],
    }));
    set((state) => ({
      protoFiles: [...state.protoFiles.filter((f) => f.path !== safeFile.path), safeFile],
    }));
  },

  removeProtoFile: (path) =>
    set((state) => ({
      protoFiles: state.protoFiles.filter((f) => f.path !== path),
    })),

  clearProtoFiles: () => set({ protoFiles: [] }),

  addTab: (method) => {
    const tab = createTab(method);
    set((state) => ({
      tabs: [...state.tabs, tab],
      activeTabId: tab.id,
    }));
    return tab.id;
  },

  removeTab: (id) =>
    set((state) => {
      const newTabs = state.tabs.filter((t) => t.id !== id);
      if (newTabs.length === 0) {
        const tab = createTab();
        return { tabs: [tab], activeTabId: tab.id };
      }
      const newActiveId =
        state.activeTabId === id
          ? newTabs[Math.min(state.tabs.findIndex((t) => t.id === id), newTabs.length - 1)]?.id
          : state.activeTabId;
      return { tabs: newTabs, activeTabId: newActiveId };
    }),

  setActiveTab: (id) => set({ activeTabId: id }),

  updateTab: (id, updates) =>
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    })),

  getActiveTab: () => {
    const state = get();
    return state.tabs.find((t) => t.id === state.activeTabId);
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
