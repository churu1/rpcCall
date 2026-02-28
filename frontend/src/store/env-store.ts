import { create } from "zustand";

interface EnvState {
  environments: Environment[];
  activeEnv: Environment | null;
  loadEnvironments: () => Promise<void>;
  saveEnvironment: (name: string, variables: Record<string, string>) => Promise<void>;
  updateEnvironment: (id: number, name: string, variables: Record<string, string>) => Promise<void>;
  deleteEnvironment: (id: number) => Promise<void>;
  setActive: (id: number) => Promise<void>;
  resolveVariables: (text: string) => string;
}

export const useEnvStore = create<EnvState>((set, get) => ({
  environments: [],
  activeEnv: null,

  loadEnvironments: async () => {
    const envs = (await window.go.main.App.ListEnvironments()) ?? [];
    const active = await window.go.main.App.GetActiveEnvironment();
    set({ environments: envs, activeEnv: active ?? null });
  },

  saveEnvironment: async (name, variables) => {
    await window.go.main.App.SaveEnvironment(name, variables);
    await get().loadEnvironments();
  },

  updateEnvironment: async (id, name, variables) => {
    await window.go.main.App.UpdateEnvironment(id, name, variables);
    await get().loadEnvironments();
  },

  deleteEnvironment: async (id) => {
    await window.go.main.App.DeleteEnvironment(id);
    await get().loadEnvironments();
  },

  setActive: async (id) => {
    await window.go.main.App.SetActiveEnvironment(id);
    await get().loadEnvironments();
  },

  resolveVariables: (text: string) => {
    const env = get().activeEnv;
    if (!env || !env.variables) return text;
    let result = text;
    for (const [k, v] of Object.entries(env.variables)) {
      result = result.replaceAll(`{{${k}}}`, v);
    }
    return result;
  },
}));
