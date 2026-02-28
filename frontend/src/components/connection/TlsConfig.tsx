import { useAppStore } from "@/store/app-store";
import { cn } from "@/lib/utils";
import { Shield, ShieldOff, FileKey, FolderOpen } from "lucide-react";

export function TlsConfig() {
  const { activeTabId, tabs, updateTab } = useAppStore();
  const tab = tabs.find((t) => t.id === activeTabId);

  if (!tab) return null;

  const selectFile = async (field: "certPath" | "keyPath" | "caPath") => {
    try {
      const path = await window.go.main.App.SelectCertFile();
      if (path) {
        updateTab(tab.id, { [field]: path } as any);
      }
    } catch {
      // user cancelled
    }
  };

  return (
    <div className="flex flex-col gap-2 p-2">
      <label className="flex items-center gap-2 text-xs cursor-pointer">
        <input
          type="checkbox"
          checked={tab.useTls ?? false}
          onChange={(e) => updateTab(tab.id, { useTls: e.target.checked } as any)}
          className="rounded"
        />
        {tab.useTls ? (
          <Shield size={14} className="text-[var(--color-method-unary)]" />
        ) : (
          <ShieldOff size={14} className="text-[var(--color-muted-foreground)]" />
        )}
        <span>Enable TLS</span>
      </label>

      {tab.useTls && (
        <div className="flex flex-col gap-1.5 ml-6">
          <FileInput
            label="CA Certificate"
            value={(tab as any).caPath || ""}
            onSelect={() => selectFile("caPath")}
          />
          <FileInput
            label="Client Certificate"
            value={(tab as any).certPath || ""}
            onSelect={() => selectFile("certPath")}
          />
          <FileInput
            label="Client Key"
            value={(tab as any).keyPath || ""}
            onSelect={() => selectFile("keyPath")}
          />
        </div>
      )}
    </div>
  );
}

function FileInput({
  label,
  value,
  onSelect,
}: {
  label: string;
  value: string;
  onSelect: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-[var(--color-muted-foreground)] w-24 shrink-0">
        {label}
      </span>
      <div className="flex-1 flex items-center gap-1 bg-[var(--color-secondary)] rounded border border-[var(--color-input)] px-2 py-0.5 text-[10px] min-w-0">
        <FileKey size={10} className="shrink-0 text-[var(--color-muted-foreground)]" />
        <span className="truncate text-[var(--color-muted-foreground)]">
          {value ? value.split("/").pop() : "Not selected"}
        </span>
      </div>
      <button
        onClick={onSelect}
        className="p-1 hover:bg-[var(--color-secondary)] rounded text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
      >
        <FolderOpen size={12} />
      </button>
    </div>
  );
}
