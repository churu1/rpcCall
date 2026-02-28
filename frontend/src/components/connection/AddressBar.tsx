import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore, type MethodType } from "@/store/app-store";
import { useGrpc } from "@/hooks/useGrpc";
import { cn } from "@/lib/utils";
import { Play, Loader2, Bookmark, ChevronDown, Trash2, Pencil, Check, X, Save } from "lucide-react";

interface SavedAddress {
  id: number;
  name: string;
  address: string;
  createdAt: string;
}

const methodTypeColors: Record<MethodType, string> = {
  unary: "text-[var(--color-method-unary)]",
  server_streaming: "text-[var(--color-method-server-stream)]",
  client_streaming: "text-[var(--color-method-client-stream)]",
  bidi_streaming: "text-[var(--color-method-bidi-stream)]",
};

const methodTypeI18nKeys: Record<MethodType, string> = {
  unary: "addressBar.unary",
  server_streaming: "addressBar.serverStream",
  client_streaming: "addressBar.clientStream",
  bidi_streaming: "addressBar.bidiStream",
};

export function AddressBar() {
  const { t } = useTranslation();
  const { activeTabId, tabs, updateTab } = useAppStore();
  const { send } = useGrpc();
  const tab = tabs.find((tabItem) => tabItem.id === activeTabId);

  const [showDropdown, setShowDropdown] = useState(false);
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [saveName, setSaveName] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const saveInputRef = useRef<HTMLDivElement>(null);

  const loadAddresses = async () => {
    try {
      const list = await window.go.main.App.ListAddresses();
      setAddresses(list ?? []);
    } catch {
      setAddresses([]);
    }
  };

  useEffect(() => {
    loadAddresses();
  }, []);

  useEffect(() => {
    const onInvoke = () => {
      if (tab?.method && !tab.isLoading) send();
    };
    document.addEventListener("rpccall:invoke", onInvoke);
    return () => document.removeEventListener("rpccall:invoke", onInvoke);
  });

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
        setEditingId(null);
      }
      if (saveInputRef.current && !saveInputRef.current.contains(e.target as Node)) {
        setShowSaveInput(false);
      }
    };
    if (showDropdown || showSaveInput) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showDropdown, showSaveInput]);

  if (!tab) return null;

  const methodType = tab.method?.methodType;
  const methodColor = methodType ? methodTypeColors[methodType] : null;
  const methodLabel = methodType ? t(methodTypeI18nKeys[methodType]) : null;

  const handleSaveAddress = async () => {
    if (!tab.address.trim()) return;
    const name = saveName.trim() || tab.address;
    try {
      await window.go.main.App.SaveAddress(name, tab.address);
      await loadAddresses();
      setShowSaveInput(false);
      setSaveName("");
    } catch { /* ignore */ }
  };

  const handleSelectAddress = (addr: SavedAddress) => {
    updateTab(tab.id, { address: addr.address });
    setShowDropdown(false);
  };

  const handleDeleteAddress = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    try {
      await window.go.main.App.DeleteAddress(id);
      await loadAddresses();
    } catch { /* ignore */ }
  };

  const startEditing = (e: React.MouseEvent, addr: SavedAddress) => {
    e.stopPropagation();
    setEditingId(addr.id);
    setEditName(addr.name);
  };

  const confirmEdit = async (e: React.MouseEvent, addr: SavedAddress) => {
    e.stopPropagation();
    if (editName.trim()) {
      try {
        await window.go.main.App.UpdateAddress(addr.id, editName.trim(), addr.address);
        await loadAddresses();
      } catch { /* ignore */ }
    }
    setEditingId(null);
  };

  const cancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(null);
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b">
      {methodLabel && (
        <span
          className={cn(
            "text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-[var(--color-secondary)] shrink-0",
            methodColor
          )}
        >
          {methodLabel}
        </span>
      )}

      <div className="relative flex-1" ref={dropdownRef}>
        <div className="flex items-center rounded-md focus-within:ring-1 focus-within:ring-[var(--color-ring)]">
          <input
            type="text"
            value={tab.address}
            onChange={(e) => updateTab(tab.id, { address: e.target.value })}
            placeholder={t("addressBar.placeholder")}
            className="flex-1 bg-[var(--color-secondary)] text-sm px-3 py-1.5 rounded-l-md border border-r-0 border-[var(--color-input)] focus:outline-none text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)]"
            onKeyDown={(e) => {
              if (e.key === "Enter" && tab.method && !tab.isLoading) send();
            }}
          />
          <button
            onClick={() => {
              if (!showDropdown) loadAddresses();
              setShowDropdown(!showDropdown);
            }}
            className="px-1.5 py-1.5 border border-l-0 border-[var(--color-input)] bg-[var(--color-secondary)] rounded-r-md hover:bg-[var(--color-accent)] transition-colors h-[34px] flex items-center"
            title={t("addressBar.selectAddress")}
          >
            <ChevronDown size={14} className={cn("text-[var(--color-muted-foreground)] transition-transform", showDropdown && "rotate-180")} />
          </button>
          <button
            onClick={() => document.dispatchEvent(new CustomEvent("rpccall:save-request"))}
            className="ml-1 p-1.5 rounded-md hover:bg-[var(--color-accent)] transition-colors text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
            title={t("addressBar.saveToCollection")}
          >
            <Save size={14} />
          </button>
          <div className="relative" ref={saveInputRef}>
            <button
              onClick={() => {
                if (!tab.address.trim()) return;
                setSaveName("");
                setShowSaveInput(!showSaveInput);
              }}
              className="ml-1 p-1.5 rounded-md hover:bg-[var(--color-accent)] transition-colors text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
              title={t("addressBar.saveAddress")}
            >
              <Bookmark size={14} />
            </button>
            {showSaveInput && (
              <div className="absolute top-full right-0 mt-1 bg-[var(--color-popover)] border border-[var(--color-border)] rounded-md shadow-lg z-50 p-2 w-[260px]">
                <div className="text-xs text-[var(--color-muted-foreground)] mb-1.5">{t("addressBar.setAlias")}</div>
                <div className="text-[10px] font-mono text-[var(--color-muted-foreground)] mb-2 truncate">{tab.address}</div>
                <input
                  autoFocus
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder={t("addressBar.aliasPlaceholder")}
                  className="w-full text-xs bg-[var(--color-secondary)] px-2 py-1.5 rounded border border-[var(--color-input)] text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--color-ring)] mb-2"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveAddress();
                    if (e.key === "Escape") setShowSaveInput(false);
                  }}
                />
                <div className="flex justify-end gap-1.5">
                  <button
                    onClick={() => setShowSaveInput(false)}
                    className="px-2 py-1 text-xs rounded hover:bg-[var(--color-secondary)] text-[var(--color-muted-foreground)]"
                  >
                    {t("common.cancel")}
                  </button>
                  <button
                    onClick={handleSaveAddress}
                    className="px-2 py-1 text-xs rounded bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary)]/80"
                  >
                    {t("common.save")}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {showDropdown && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--color-popover)] border border-[var(--color-border)] rounded-md shadow-lg z-50 max-h-[240px] overflow-y-auto">
            {addresses.length === 0 ? (
              <div className="px-3 py-4 text-xs text-center text-[var(--color-muted-foreground)]">
                {t("addressBar.noAddresses")}{t("addressBar.clickToSave")} <Bookmark size={12} className="inline" />
              </div>
            ) : (
              addresses.map((addr) => (
                <div
                  key={addr.id}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-[var(--color-accent)] transition-colors group",
                    addr.address === tab.address && "bg-[var(--color-accent)]/50"
                  )}
                  onClick={() => handleSelectAddress(addr)}
                >
                  {editingId === addr.id ? (
                    <div className="flex-1 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <input
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="flex-1 text-xs bg-[var(--color-secondary)] px-2 py-0.5 rounded border border-[var(--color-input)] text-[var(--color-foreground)] focus:outline-none"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") confirmEdit(e as any, addr);
                          if (e.key === "Escape") cancelEdit(e as any);
                        }}
                      />
                      <button onClick={(e) => confirmEdit(e, addr)} className="p-0.5 hover:text-green-500"><Check size={12} /></button>
                      <button onClick={cancelEdit} className="p-0.5 hover:text-[var(--color-destructive)]"><X size={12} /></button>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        {addr.name && addr.name !== addr.address ? (
                          <>
                            <div className="text-xs font-medium text-[var(--color-foreground)] truncate">
                              {addr.name}
                            </div>
                            <div className="text-[10px] text-[var(--color-muted-foreground)] font-mono truncate">
                              {addr.address}
                            </div>
                          </>
                        ) : (
                          <div className="text-xs font-mono text-[var(--color-foreground)] truncate">
                            {addr.address}
                          </div>
                        )}
                      </div>
                      <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                        <button
                          onClick={(e) => startEditing(e, addr)}
                          className="p-1 rounded hover:bg-[var(--color-secondary)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
                          title={t("addressBar.rename")}
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          onClick={(e) => handleDeleteAddress(e, addr.id)}
                          className="p-1 rounded hover:bg-[var(--color-secondary)] text-[var(--color-muted-foreground)] hover:text-[var(--color-destructive)]"
                          title={t("addressBar.delete")}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <button
        className={cn(
          "flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors shrink-0",
          tab.isLoading
            ? "bg-[var(--color-destructive)] hover:bg-[var(--color-destructive)]/80 text-white"
            : "bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/80 text-white",
          !tab.method && "opacity-50 cursor-not-allowed"
        )}
        disabled={!tab.method || tab.isLoading}
        onClick={send}
      >
        {tab.isLoading ? (
          <>
            <Loader2 size={14} className="animate-spin" />
            {t("addressBar.sending")}
          </>
        ) : (
          <>
            <Play size={14} />
            {t("addressBar.send")}
          </>
        )}
      </button>
    </div>
  );
}
