import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Props {
  onClose: () => void;
}

const shortcutGroups = [
  {
    titleKey: "shortcuts.general",
    items: [
      { keys: "⌘ K", descKey: "shortcuts.commandPalette" },
      { keys: "⌘ T", descKey: "shortcuts.newTab" },
      { keys: "⌘ W", descKey: "shortcuts.closeTab" },
      { keys: "⌘ Enter", descKey: "shortcuts.sendRequest" },
    ],
  },
  {
    titleKey: "shortcuts.proto",
    items: [
      { keys: "⌘ R", descKey: "shortcuts.reloadProtos" },
    ],
  },
  {
    titleKey: "shortcuts.editing",
    items: [
      { keys: "⌘ F", descKey: "shortcuts.search" },
      { keys: "Tab", descKey: "shortcuts.indent" },
      { keys: "Esc", descKey: "shortcuts.closeSearch" },
    ],
  },
  {
    titleKey: "shortcuts.navigation",
    items: [
      { keys: "↑ ↓", descKey: "shortcuts.navigateList" },
      { keys: "Enter", descKey: "shortcuts.selectItem" },
    ],
  },
];

export function ShortcutsPanel({ onClose }: Props) {
  const { t } = useTranslation();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-[var(--color-card)] border rounded-lg shadow-xl w-[480px] max-h-[70vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="text-sm font-medium">{t("shortcuts.title")}</h3>
          <button onClick={onClose} className="p-1 hover:bg-[var(--color-secondary)] rounded">
            <X size={14} />
          </button>
        </div>
        <div className="overflow-auto p-4 flex flex-col gap-4">
          {shortcutGroups.map((group) => (
            <div key={group.titleKey}>
              <h4 className="text-[10px] font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wider mb-2">
                {t(group.titleKey)}
              </h4>
              <div className="flex flex-col gap-1">
                {group.items.map((item) => (
                  <div key={item.descKey} className="flex items-center justify-between py-1">
                    <span className="text-xs text-[var(--color-foreground)]">{t(item.descKey)}</span>
                    <kbd className="text-[10px] text-[var(--color-muted-foreground)] bg-[var(--color-secondary)] px-2 py-0.5 rounded font-mono">
                      {item.keys}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
