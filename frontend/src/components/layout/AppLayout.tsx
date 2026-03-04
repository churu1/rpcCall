import { useRef, useState, useCallback, useEffect } from "react";
import { useAppStore } from "@/store/app-store";
import { useThemeStore } from "@/store/theme-store";
import { useTranslation } from "react-i18next";
import { Sun, Moon, Keyboard, Languages, Sparkles, HelpCircle } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { Card } from "@/components/ui/Card";
import { TabBar } from "./TabBar";
import { ServiceTree } from "@/components/service-tree/ServiceTree";
import { AddressBar } from "@/components/connection/AddressBar";
import { RequestEditor } from "@/components/editor/RequestEditor";
import { ResponseViewer } from "@/components/response/ResponseViewer";
import { HistoryPanel } from "@/components/history/HistoryPanel";
import { CommandPalette } from "@/components/command-palette/CommandPalette";
import { EnvironmentSelector } from "@/components/environment/EnvironmentSelector";
import { EnvironmentEditor } from "@/components/environment/EnvironmentEditor";
import { CollectionPanel } from "@/components/collection/CollectionPanel";
import { SaveRequestDialog } from "@/components/collection/SaveRequestDialog";
import { ShortcutsPanel } from "@/components/shortcuts/ShortcutsPanel";
import { AISettingsPanel } from "@/components/ai/AISettingsPanel";
import { HelpPanel } from "@/components/help/HelpPanel";

export function AppLayout() {
  const { sidebarWidth, setSidebarWidth } = useAppStore();
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const { t, i18n } = useTranslation();

  const handleMouseDown = useCallback(() => {
    setIsResizing(true);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(180, Math.min(500, e.clientX));
      setSidebarWidth(newWidth);
    };
    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [setSidebarWidth]);

  const { theme, toggleTheme } = useThemeStore();
  const [showEnvEditor, setShowEnvEditor] = useState(false);
  const [showSaveRequest, setShowSaveRequest] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showAISettings, setShowAISettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const toggleLang = useCallback(() => {
    const next = i18n.language === "zh" ? "en" : "zh";
    i18n.changeLanguage(next);
    localStorage.setItem("rpccall-lang", next);
  }, [i18n]);

  useEffect(() => {
    const onManageEnvs = () => setShowEnvEditor(true);
    const onSaveRequest = () => setShowSaveRequest(true);
    const onShowShortcuts = () => setShowShortcuts(true);
    const onAISettings = () => setShowAISettings(true);
    document.addEventListener("rpccall:manage-envs", onManageEnvs);
    document.addEventListener("rpccall:save-request", onSaveRequest);
    document.addEventListener("rpccall:show-shortcuts", onShowShortcuts);
    document.addEventListener("rpccall:ai-settings", onAISettings);
    return () => {
      document.removeEventListener("rpccall:manage-envs", onManageEnvs);
      document.removeEventListener("rpccall:save-request", onSaveRequest);
      document.removeEventListener("rpccall:show-shortcuts", onShowShortcuts);
      document.removeEventListener("rpccall:ai-settings", onAISettings);
    };
  }, []);

  return (
    <div className="flex flex-col h-screen bg-[var(--surface-0)]">
      <CommandPalette />
      {showEnvEditor && <EnvironmentEditor onClose={() => setShowEnvEditor(false)} />}
      {showSaveRequest && <SaveRequestDialog onClose={() => setShowSaveRequest(false)} />}
      {showShortcuts && <ShortcutsPanel onClose={() => setShowShortcuts(false)} />}
      {showAISettings && <AISettingsPanel onClose={() => setShowAISettings(false)} />}
      {showHelp && <HelpPanel onClose={() => setShowHelp(false)} />}
      {/* Drag region for macOS title bar */}
      <div
        className="h-8 bg-[var(--surface-1)] border-b border-[var(--line-soft)] flex items-center justify-center text-[11px] text-[var(--text-muted)] select-none relative"
        style={{ "--wails-draggable": "drag" } as React.CSSProperties}
      >
        {t("app.title")}
        <div
          className="absolute right-2 top-1 flex items-center gap-1"
          style={{ "--wails-draggable": "no-drag" } as React.CSSProperties}
        >
          <EnvironmentSelector onManage={() => setShowEnvEditor(true)} />
          <IconButton
            size="sm"
            tone="primary"
            onClick={() => setShowAISettings(true)}
            title={t("ai.settingsTitle")}
          >
            <Sparkles size={14} />
          </IconButton>
          <IconButton
            size="sm"
            onClick={() => setShowHelp(true)}
            title={t("help.title")}
          >
            <HelpCircle size={14} />
          </IconButton>
          <IconButton
            size="sm"
            onClick={() => setShowShortcuts(true)}
            title={t("shortcuts.title")}
          >
            <Keyboard size={14} />
          </IconButton>
          <IconButton
            size="sm"
            onClick={toggleLang}
            title={t("lang.switch")}
          >
            <Languages size={14} />
          </IconButton>
          <IconButton
            size="sm"
            onClick={toggleTheme}
            title={theme === "dark" ? t("titlebar.lightMode") : t("titlebar.darkMode")}
          >
            {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
          </IconButton>
        </div>
      </div>

      <TabBar />

      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <div
          ref={sidebarRef}
          className="bg-[var(--color-sidebar)] border-r border-[var(--line-soft)] shrink-0 flex flex-col overflow-hidden"
          style={{ width: sidebarWidth }}
        >
          <div className="flex-1 min-h-0 overflow-auto">
            <ServiceTree />
          </div>
          <CollectionPanel />
        </div>

        {/* Resize handle */}
        <div
          className="w-1 hover:bg-[var(--state-info)]/45 cursor-col-resize shrink-0 transition-colors"
          onMouseDown={handleMouseDown}
          style={isResizing ? { backgroundColor: "var(--state-info)" } : undefined}
        />

        {/* Main content */}
        <div className="flex flex-col flex-1 min-w-0">
          <AddressBar />
          <div className="flex flex-1 min-h-0">
            {/* Request panel */}
            <div className="flex-1 border-r border-[var(--line-soft)] min-w-0 overflow-hidden p-1.5">
              <Card className="h-full overflow-hidden">
                <RequestEditor />
              </Card>
            </div>
            {/* Response panel */}
            <div className="flex-1 min-w-[420px] overflow-hidden p-1.5 pl-0">
              <Card className="h-full overflow-hidden">
                <ResponseViewer />
              </Card>
            </div>
          </div>
          <HistoryPanel />
        </div>
      </div>
    </div>
  );
}
