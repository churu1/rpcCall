import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useAppStore, type ServiceMethod } from "@/store/app-store";
import { useTranslation } from "react-i18next";
import {
  Plus,
  Send,
  FileSearch,
  FolderSearch,
  Wifi,
  Sun,
  Moon,
  Search,
  Trash2,
  RefreshCw,
  Play,
  Square,
  Globe,
  Settings,
  Save,
  Keyboard,
  Download,
  Upload,
  Sparkles,
  Binary,
} from "lucide-react";
import { useThemeStore } from "@/store/theme-store";
import { scoreFuzzyText } from "@/lib/fuzzy-search";

interface CommandItem {
  id: string;
  label: string;
  category: string;
  icon: React.ReactNode;
  shortcut?: string;
  action: () => void;
}

interface MethodItem {
  id: string;
  method: ServiceMethod;
  serviceName: string;
  methodName: string;
  fullName: string;
  methodType: string;
  projectId: string;
}

const METHOD_TYPE_I18N: Record<string, string> = {
  unary: "addressBar.unary",
  server_streaming: "addressBar.serverStream",
  client_streaming: "addressBar.clientStream",
  bidi_streaming: "addressBar.bidiStream",
};

const METHOD_TYPE_COLORS: Record<string, string> = {
  unary: "bg-green-500/20 text-green-400",
  server_streaming: "bg-blue-500/20 text-blue-400",
  client_streaming: "bg-orange-500/20 text-orange-400",
  bidi_streaming: "bg-purple-500/20 text-purple-400",
};

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchAllProjects, setSearchAllProjects] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const keyboardNavRef = useRef(false);
  const { protoFiles, protoProjects, tabs, addTab, removeTab, activeTabId, activeProjectId, updateTab } = useAppStore();
  const { theme, toggleTheme } = useThemeStore();
  const { t } = useTranslation();
  const projectNameById = useMemo(() => {
    const names: Record<string, string> = {};
    for (const project of protoProjects) names[project.id] = project.name;
    return names;
  }, [protoProjects]);
  const activeTabProjectId = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId)?.projectId ?? null,
    [tabs, activeTabId]
  );
  const scopedProjectId = activeTabProjectId ?? activeProjectId;
  const scopedProjectName = scopedProjectId ? (projectNameById[scopedProjectId] ?? "") : "";

  const allMethods = useMemo<MethodItem[]>(() => {
    const methods: MethodItem[] = [];
    for (const file of protoFiles) {
      for (const service of file.services ?? []) {
        for (const method of service.methods ?? []) {
          methods.push({
            id: method.fullName,
            method,
            serviceName: service.name,
            methodName: method.methodName,
            fullName: method.fullName,
            methodType: method.methodType,
            projectId: file.projectId,
          });
        }
      }
    }
    return methods;
  }, [protoFiles]);

  const searchableMethods = useMemo(() => {
    if (searchAllProjects) return allMethods;
    if (!scopedProjectId) return [];
    return allMethods.filter((method) => method.projectId === scopedProjectId);
  }, [allMethods, scopedProjectId, searchAllProjects]);

  const commands = useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = [
      {
        id: "new-tab",
        label: t("command.newTab"),
        category: "GRPC",
        icon: <Plus size={14} />,
        shortcut: "⌘ T",
        action: () => { addTab(); close(); },
      },
      {
        id: "invoke",
        label: t("command.invoke"),
        category: "GRPC",
        icon: <Send size={14} />,
        shortcut: "⌘ Enter",
        action: () => {
          close();
          setTimeout(() => {
            document.dispatchEvent(new CustomEvent("rpccall:invoke"));
          }, 50);
        },
      },
      {
        id: "import-file",
        label: t("command.importFile"),
        category: "PROTO",
        icon: <FileSearch size={14} />,
        action: () => {
          close();
          setTimeout(() => {
            document.dispatchEvent(new CustomEvent("rpccall:import-file"));
          }, 50);
        },
      },
      {
        id: "import-dir",
        label: t("command.importDir"),
        category: "PROTO",
        icon: <FolderSearch size={14} />,
        action: () => {
          close();
          setTimeout(() => {
            document.dispatchEvent(new CustomEvent("rpccall:import-dir"));
          }, 50);
        },
      },
      {
        id: "reflection",
        label: t("command.reflection"),
        category: "PROTO",
        icon: <Wifi size={14} />,
        action: () => {
          close();
          setTimeout(() => {
            document.dispatchEvent(new CustomEvent("rpccall:reflection"));
          }, 50);
        },
      },
      {
        id: "toggle-theme",
        label: t("command.toggleTheme"),
        category: "APPEARANCE",
        icon: theme === "dark" ? <Sun size={14} /> : <Moon size={14} />,
        action: () => { toggleTheme(); close(); },
      },
      {
        id: "reload-protos",
        label: t("command.reloadProtos"),
        category: "PROTO",
        icon: <RefreshCw size={14} />,
        shortcut: "⌘ R",
        action: () => {
          close();
          setTimeout(() => {
            document.dispatchEvent(new CustomEvent("rpccall:reload-protos"));
          }, 50);
        },
      },
      {
        id: "clear-protos",
        label: t("command.clearProtos"),
        category: "PROTO",
        icon: <Trash2 size={14} />,
        action: () => {
          close();
          setTimeout(() => {
            document.dispatchEvent(new CustomEvent("rpccall:clear-protos"));
          }, 50);
        },
      },
      {
        id: "start-benchmark",
        label: t("command.startBenchmark"),
        category: "BENCHMARK",
        icon: <Play size={14} />,
        action: () => {
          close();
          setTimeout(() => {
            document.dispatchEvent(new CustomEvent("rpccall:start-benchmark"));
          }, 50);
        },
      },
      {
        id: "stop-benchmark",
        label: t("command.stopBenchmark"),
        category: "BENCHMARK",
        icon: <Square size={14} />,
        action: () => {
          close();
          setTimeout(() => {
            document.dispatchEvent(new CustomEvent("rpccall:stop-benchmark"));
          }, 50);
        },
      },
      {
        id: "select-env",
        label: t("command.selectEnv"),
        category: "ENVIRONMENT",
        icon: <Globe size={14} />,
        action: () => {
          close();
          setTimeout(() => {
            document.dispatchEvent(new CustomEvent("rpccall:select-env"));
          }, 50);
        },
      },
      {
        id: "manage-envs",
        label: t("command.manageEnvs"),
        category: "ENVIRONMENT",
        icon: <Settings size={14} />,
        action: () => {
          close();
          setTimeout(() => {
            document.dispatchEvent(new CustomEvent("rpccall:manage-envs"));
          }, 50);
        },
      },
      {
        id: "save-request",
        label: t("command.saveRequest"),
        category: "COLLECTION",
        icon: <Save size={14} />,
        action: () => {
          close();
          setTimeout(() => {
            document.dispatchEvent(new CustomEvent("rpccall:save-request"));
          }, 50);
        },
      },
      {
        id: "export-workspace",
        label: t("command.exportWorkspace"),
        category: "WORKSPACE",
        icon: <Download size={14} />,
        action: () => {
          close();
          setTimeout(() => {
            window.go.main.App.ExportWorkspace().catch(() => {});
          }, 50);
        },
      },
      {
        id: "import-workspace",
        label: t("command.importWorkspace"),
        category: "WORKSPACE",
        icon: <Upload size={14} />,
        action: () => {
          close();
          setTimeout(() => {
            window.go.main.App.ImportWorkspace().catch(() => {});
          }, 50);
        },
      },
      {
        id: "show-shortcuts",
        label: t("command.showShortcuts"),
        category: "HELP",
        icon: <Keyboard size={14} />,
        shortcut: "⌘ /",
        action: () => {
          close();
          setTimeout(() => {
            document.dispatchEvent(new CustomEvent("rpccall:show-shortcuts"));
          }, 50);
        },
      },
      {
        id: "ai-settings",
        label: t("ai.settingsTitle"),
        category: "AI",
        icon: <Sparkles size={14} />,
        action: () => {
          close();
          setTimeout(() => {
            document.dispatchEvent(new CustomEvent("rpccall:ai-settings"));
          }, 50);
        },
      },
      {
        id: "open-decode",
        label: t("command.openDecode"),
        category: "DECODE",
        icon: <Binary size={14} />,
        shortcut: "⌘ ⇧ D",
        action: () => {
          close();
          setTimeout(() => {
            document.dispatchEvent(new CustomEvent("rpccall:open-decode"));
          }, 50);
        },
      },
      {
        id: "decode-batch",
        label: t("command.decodeBatch"),
        category: "DECODE",
        icon: <Binary size={14} />,
        shortcut: "⌘ ⇧ B",
        action: () => {
          close();
          setTimeout(() => {
            document.dispatchEvent(new CustomEvent("rpccall:open-decode-batch"));
          }, 50);
        },
      },
    ];
    return items;
  }, [addTab, theme, toggleTheme, t]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setSelectedIndex(0);
    setSearchAllProjects(false);
  }, []);

  const filteredMethods = useMemo(() => {
    if (!query.trim()) return [];
    return searchableMethods
      .map((m) => {
        const score = Math.max(
          scoreFuzzyText(m.methodName, query),
          scoreFuzzyText(m.serviceName, query),
          scoreFuzzyText(m.fullName, query)
        );
        return { m, score };
      })
      .filter((x) => x.score >= 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.m);
  }, [query, searchableMethods]);

  const filteredCommands = useMemo(() => {
    if (!query.trim()) return commands;
    return commands
      .map((c) => ({
        c,
        score: Math.max(scoreFuzzyText(c.label, query), scoreFuzzyText(c.category, query)),
      }))
      .filter((x) => x.score >= 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.c);
  }, [query, commands]);

  const totalItems = filteredCommands.length + filteredMethods.length;

  useEffect(() => {
    setSelectedIndex(0);
  }, [query, searchAllProjects, scopedProjectId]);

  const openMethod = useCallback((item: MethodItem) => {
    const tabId = addTab(item.method);
    updateTab(tabId, { projectId: item.projectId });
    close();
  }, [addTab, updateTab, close]);

  const executeSelected = useCallback(() => {
    if (selectedIndex < filteredCommands.length) {
      filteredCommands[selectedIndex].action();
    } else {
      const methodIdx = selectedIndex - filteredCommands.length;
      const item = filteredMethods[methodIdx];
      if (item) {
        openMethod(item);
      }
    }
  }, [selectedIndex, filteredCommands, filteredMethods, openMethod]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "t") {
        e.preventDefault();
        addTab();
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "w") {
        e.preventDefault();
        if (activeTabId) removeTab(activeTabId);
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        if (document.querySelector("[data-decode-panel='true']")) {
          document.dispatchEvent(new CustomEvent("rpccall:decode-run"));
        } else {
          document.dispatchEvent(new CustomEvent("rpccall:invoke"));
        }
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "D" || e.key === "d")) {
        e.preventDefault();
        document.dispatchEvent(new CustomEvent("rpccall:open-decode"));
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "B" || e.key === "b")) {
        e.preventDefault();
        document.dispatchEvent(new CustomEvent("rpccall:open-decode-batch"));
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "r") {
        e.preventDefault();
        document.dispatchEvent(new CustomEvent("rpccall:reload-protos"));
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        document.dispatchEvent(new CustomEvent("rpccall:show-shortcuts"));
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [addTab, removeTab, activeTabId]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        keyboardNavRef.current = true;
        setSelectedIndex((i) => (i + 1) % Math.max(totalItems, 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        keyboardNavRef.current = true;
        setSelectedIndex((i) => (i - 1 + Math.max(totalItems, 1)) % Math.max(totalItems, 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        executeSelected();
      }
    },
    [close, totalItems, executeSelected]
  );

  const handleMouseMove = useCallback(() => {
    keyboardNavRef.current = false;
  }, []);

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`) as HTMLElement | null;
    if (!el || !listRef.current) return;

    const list = listRef.current;
    const pad = 40;
    const elTop = el.offsetTop;
    const elBottom = elTop + el.offsetHeight;
    const viewTop = list.scrollTop;
    const viewBottom = viewTop + list.clientHeight;

    if (elTop - pad < viewTop) {
      list.scrollTop = Math.max(0, elTop - pad);
    } else if (elBottom + pad > viewBottom) {
      list.scrollTop = elBottom + pad - list.clientHeight;
    }
  }, [selectedIndex]);

  if (!open) return null;

  let itemIndex = 0;

  const groupedCommands: Record<string, CommandItem[]> = {};
  for (const cmd of filteredCommands) {
    if (!groupedCommands[cmd.category]) groupedCommands[cmd.category] = [];
    groupedCommands[cmd.category].push(cmd);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onClick={close}
    >
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative w-[560px] max-h-[62vh] bg-[var(--surface-0)] border border-[var(--line-soft)] rounded-xl shadow-[var(--elevation-2)] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--line-soft)] bg-[var(--surface-1)]">
          <Search size={16} className="text-[var(--text-muted)] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder={t("command.placeholder")}
            className="flex-1 bg-transparent text-sm text-[var(--text-normal)] outline-none placeholder:text-[var(--text-muted)]"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />
          <label className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] select-none">
            <input
              type="checkbox"
              checked={searchAllProjects}
              onChange={(e) => setSearchAllProjects(e.target.checked)}
              className="h-3.5 w-3.5 rounded border border-[var(--line-strong)] accent-[var(--state-info)]"
            />
            <span>{t("command.searchAllProjects")}</span>
          </label>
          <kbd className="text-[10px] text-[var(--text-muted)] bg-[var(--surface-2)] px-1.5 py-0.5 rounded font-mono border border-[var(--line-soft)]">
            ESC
          </kbd>
        </div>
        {!searchAllProjects && (
          <div className="px-4 py-1.5 border-b border-[var(--line-soft)] text-[11px] text-[var(--text-muted)] truncate bg-[var(--surface-1)]">
            {scopedProjectId
              ? t("command.scopeCurrentProject", { project: scopedProjectName || scopedProjectId })
              : t("command.scopeNoProject")}
          </div>
        )}

        {/* Results */}
        <div ref={listRef} className="overflow-y-auto max-h-[50vh] py-1" onMouseMove={handleMouseMove}>
          {/* Command groups */}
          {Object.entries(groupedCommands).map(([category, cmds]) => (
            <div key={category}>
              <div className="px-4 py-1.5 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                {category}
              </div>
              {cmds.map((cmd) => {
                const idx = itemIndex++;
                return (
                  <div
                    key={cmd.id}
                    data-index={idx}
                    className={`flex items-center gap-3 px-4 py-2 cursor-pointer text-sm transition-colors ${
                      idx === selectedIndex
                        ? "bg-[var(--state-info)]/16 text-[var(--text-strong)]"
                        : "text-[var(--text-normal)] hover:bg-[var(--surface-2)]"
                    }`}
                    onClick={cmd.action}
                    onMouseEnter={() => { if (!keyboardNavRef.current) setSelectedIndex(idx); }}
                  >
                    <span className="text-[var(--text-muted)]">{cmd.icon}</span>
                    <span className="flex-1">{cmd.label}</span>
                    {cmd.shortcut && (
                      <kbd className="text-[10px] text-[var(--text-muted)] bg-[var(--surface-2)] px-1.5 py-0.5 rounded font-mono flex items-center gap-0.5 border border-[var(--line-soft)]">
                        {cmd.shortcut}
                      </kbd>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          {/* Method results */}
          {filteredMethods.length > 0 && (
            <div>
              <div className="px-4 py-1.5 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                METHODS ({filteredMethods.length})
              </div>
              {filteredMethods.map((item) => {
                const idx = itemIndex++;
                return (
                  <div
                    key={item.id}
                    data-index={idx}
                    className={`flex items-center gap-3 px-4 py-2 cursor-pointer text-sm transition-colors ${
                      idx === selectedIndex
                        ? "bg-[var(--state-info)]/16 text-[var(--text-strong)]"
                        : "text-[var(--text-normal)] hover:bg-[var(--surface-2)]"
                    }`}
                    onClick={() => openMethod(item)}
                    onMouseEnter={() => { if (!keyboardNavRef.current) setSelectedIndex(idx); }}
                  >
                    <span
                      className={`text-[9px] font-mono px-1.5 py-0.5 rounded shrink-0 ${
                        METHOD_TYPE_COLORS[item.methodType] ?? ""
                      }`}
                    >
                      {METHOD_TYPE_I18N[item.methodType] ? t(METHOD_TYPE_I18N[item.methodType]) : item.methodType}
                    </span>
                    <span className="flex-1 truncate">
                      <span className="text-[var(--text-muted)]">
                        {item.serviceName}/
                      </span>
                      <span className="font-medium">{item.methodName}</span>
                    </span>
                    {searchAllProjects && (
                      <span className="text-[10px] text-[var(--text-muted)] truncate max-w-[120px]">
                        {projectNameById[item.projectId] ?? item.projectId}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Empty state */}
          {totalItems === 0 && (
            <div className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">
              {t("command.noResults")}
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-[var(--line-soft)] flex items-center gap-3 text-[10px] text-[var(--text-muted)] bg-[var(--surface-1)]">
          <span className="flex items-center gap-1">
            <kbd className="bg-[var(--surface-2)] border border-[var(--line-soft)] px-1 py-0.5 rounded font-mono">↑↓</kbd>
            {t("command.navigate")}
          </span>
          <span className="flex items-center gap-1">
            <kbd className="bg-[var(--surface-2)] border border-[var(--line-soft)] px-1 py-0.5 rounded font-mono">↵</kbd>
            {t("command.select")}
          </span>
          <span className="flex items-center gap-1">
            <kbd className="bg-[var(--surface-2)] border border-[var(--line-soft)] px-1 py-0.5 rounded font-mono">esc</kbd>
            {t("command.close")}
          </span>
        </div>
      </div>
    </div>
  );
}
