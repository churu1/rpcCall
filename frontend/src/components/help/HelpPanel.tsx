import { X, Send, FileText, ListFilter, Globe2, FolderHeart, Clock, Gauge, Link2, Server, Lock, Sparkles, Terminal, GitCompareArrows, Palette, Binary } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Props {
  onClose: () => void;
}

const features = [
  { icon: Send, titleKey: "help.grpcCall", descKey: "help.grpcCallDesc", tipKey: "help.grpcCallTip", color: "text-blue-400" },
  { icon: FileText, titleKey: "help.protoImport", descKey: "help.protoImportDesc", tipKey: "help.protoImportTip", color: "text-green-400" },
  { icon: ListFilter, titleKey: "help.metadata", descKey: "help.metadataDesc", color: "text-yellow-400" },
  { icon: Globe2, titleKey: "help.environment", descKey: "help.environmentDesc", color: "text-cyan-400" },
  { icon: FolderHeart, titleKey: "help.collections", descKey: "help.collectionsDesc", color: "text-pink-400" },
  { icon: Clock, titleKey: "help.history", descKey: "help.historyDesc", tipKey: "help.historyTip", color: "text-orange-400" },
  { icon: GitCompareArrows, titleKey: "help.diff", descKey: "help.diffDesc", color: "text-violet-400" },
  { icon: Gauge, titleKey: "help.benchmark", descKey: "help.benchmarkDesc", color: "text-red-400" },
  { icon: Link2, titleKey: "help.chain", descKey: "help.chainDesc", color: "text-emerald-400" },
  { icon: Server, titleKey: "help.mock", descKey: "help.mockDesc", color: "text-amber-400" },
  { icon: Binary, titleKey: "help.decode", descKey: "help.decodeDesc", color: "text-cyan-400" },
  { icon: Lock, titleKey: "help.tls", descKey: "help.tlsDesc", color: "text-slate-400" },
  { icon: Sparkles, titleKey: "help.ai", descKey: "help.aiDesc", color: "text-purple-400" },
  { icon: Terminal, titleKey: "help.commandPalette", descKey: "help.commandPaletteDesc", color: "text-teal-400" },
  { icon: Clock, titleKey: "help.timeout", descKey: "help.timeoutDesc", color: "text-rose-400" },
  { icon: Palette, titleKey: "help.theme", descKey: "help.themeDesc", color: "text-indigo-400" },
];

export function HelpPanel({ onClose }: Props) {
  const { t } = useTranslation();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-[var(--color-card)] border rounded-lg shadow-xl w-[560px] max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="text-sm font-medium">{t("help.title")}</h3>
          <button onClick={onClose} className="p-1 hover:bg-[var(--color-secondary)] rounded">
            <X size={14} />
          </button>
        </div>
        <div className="overflow-auto p-3 flex flex-col gap-1.5">
          {features.map((f) => (
            <div
              key={f.titleKey}
              className="flex gap-3 p-2.5 rounded-md hover:bg-[var(--color-secondary)] transition-colors"
            >
              <div className="shrink-0 mt-0.5">
                <f.icon size={16} className={f.color} />
              </div>
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-xs font-medium text-[var(--color-foreground)]">
                  {t(f.titleKey)}
                </span>
                <span className="text-[11px] text-[var(--color-muted-foreground)] leading-relaxed">
                  {t(f.descKey)}
                </span>
                {f.tipKey && (
                  <kbd className="self-start mt-0.5 text-[10px] text-[var(--color-primary)] bg-[var(--color-primary)]/10 px-1.5 py-0.5 rounded font-mono">
                    {t(f.tipKey)}
                  </kbd>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
