import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore, type MethodType } from "@/store/app-store";
import { useGrpc } from "@/hooks/useGrpc";
import { cn } from "@/lib/utils";
import { Play, Loader2, Bookmark, ChevronDown, Trash2, Pencil, Check, X, Save, Shield, ShieldOff, FileKey, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";

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
  const [showTls, setShowTls] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const saveInputRef = useRef<HTMLDivElement>(null);
  const tlsRef = useRef<HTMLDivElement>(null);

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
      if (tlsRef.current && !tlsRef.current.contains(e.target as Node)) {
        setShowTls(false);
      }
    };
    if (showDropdown || showSaveInput || showTls) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showDropdown, showSaveInput, showTls]);

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
    <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--line-soft)] bg-[var(--surface-1)]">
      {methodLabel && (
        <span
          className={cn(
            "text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-[var(--surface-2)] border border-[var(--line-soft)] shrink-0",
            methodColor
          )}
        >
          {methodLabel}
        </span>
      )}

      <div className="relative flex-1" ref={dropdownRef}>
        <div className="flex items-center rounded-md focus-within:ring-2 focus-within:ring-[var(--focus-ring)]/25">
          <Input
            type="text"
            value={tab.address}
            onChange={(e) => updateTab(tab.id, { address: e.target.value })}
            placeholder={t("addressBar.placeholder")}
            className="flex-1 h-8 bg-[var(--surface-2)] text-sm px-3 py-1.5 rounded-l-md border border-r-0 border-[var(--line-strong)] focus:outline-none text-[var(--text-normal)] placeholder:text-[var(--text-muted)]"
            onKeyDown={(e) => {
              if (e.key === "Enter" && tab.method && !tab.isLoading) send();
            }}
          />
          <button
            onClick={() => {
              if (!showDropdown) loadAddresses();
              setShowDropdown(!showDropdown);
            }}
            className="px-1.5 py-1.5 border border-l-0 border-[var(--line-strong)] bg-[var(--surface-2)] rounded-r-md hover:bg-[var(--surface-1)] transition-colors h-8 flex items-center"
            title={t("addressBar.selectAddress")}
          >
            <ChevronDown size={14} className={cn("text-[var(--text-muted)] transition-transform", showDropdown && "rotate-180")} />
          </button>
          <IconButton
            size="sm"
            onClick={() => document.dispatchEvent(new CustomEvent("rpccall:save-request"))}
            className="ml-1"
            title={t("addressBar.saveToCollection")}
          >
            <Save size={14} />
          </IconButton>
          <div className="relative" ref={saveInputRef}>
            <IconButton
              size="sm"
              onClick={() => {
                if (!tab.address.trim()) return;
                setSaveName("");
                setShowSaveInput(!showSaveInput);
              }}
              className="ml-1"
              title={t("addressBar.saveAddress")}
            >
              <Bookmark size={14} />
            </IconButton>
            {showSaveInput && (
              <div className="absolute top-full right-0 mt-1 bg-[var(--surface-0)] border border-[var(--line-soft)] rounded-md shadow-[var(--elevation-2)] z-50 p-2 w-[260px]">
                <div className="text-xs text-[var(--text-muted)] mb-1.5">{t("addressBar.setAlias")}</div>
                <div className="text-[10px] font-mono text-[var(--text-muted)] mb-2 truncate">{tab.address}</div>
                <Input
                  autoFocus
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder={t("addressBar.aliasPlaceholder")}
                  className="ui-input w-full text-xs mb-2"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveAddress();
                    if (e.key === "Escape") setShowSaveInput(false);
                  }}
                />
                <div className="flex justify-end gap-1.5">
                  <Button
                    onClick={() => setShowSaveInput(false)}
                    variant="ghost"
                    size="sm"
                  >
                    {t("common.cancel")}
                  </Button>
                  <Button
                    onClick={handleSaveAddress}
                    variant="primary"
                    size="sm"
                  >
                    {t("common.save")}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {showDropdown && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--surface-0)] border border-[var(--line-soft)] rounded-md shadow-[var(--elevation-2)] z-50 max-h-[240px] overflow-y-auto">
            {addresses.length === 0 ? (
              <div className="px-3 py-4 text-xs text-center text-[var(--text-muted)]">
                {t("addressBar.noAddresses")}{t("addressBar.clickToSave")} <Bookmark size={12} className="inline" />
              </div>
            ) : (
              addresses.map((addr) => (
                <div
                  key={addr.id}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-[var(--surface-1)] transition-colors group",
                    addr.address === tab.address && "bg-[var(--surface-1)]/50"
                  )}
                  onClick={() => handleSelectAddress(addr)}
                >
                  {editingId === addr.id ? (
                    <div className="flex-1 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <Input
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="flex-1 text-xs bg-[var(--surface-1)] px-2 py-0.5 rounded border border-[var(--line-strong)] text-[var(--text-normal)] focus:outline-none h-7"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") confirmEdit(e as any, addr);
                          if (e.key === "Escape") cancelEdit(e as any);
                        }}
                      />
                      <IconButton onClick={(e) => confirmEdit(e, addr)} size="sm" tone="primary" className="h-6 w-6 border-transparent bg-transparent"><Check size={12} /></IconButton>
                      <IconButton onClick={cancelEdit} size="sm" tone="danger" className="h-6 w-6 border-transparent bg-transparent"><X size={12} /></IconButton>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        {addr.name && addr.name !== addr.address ? (
                          <>
                            <div className="text-xs font-medium text-[var(--text-normal)] truncate">
                              {addr.name}
                            </div>
                            <div className="text-[10px] text-[var(--text-muted)] font-mono truncate">
                              {addr.address}
                            </div>
                          </>
                        ) : (
                          <div className="text-xs font-mono text-[var(--text-normal)] truncate">
                            {addr.address}
                          </div>
                        )}
                      </div>
                      <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                        <IconButton
                          onClick={(e) => startEditing(e, addr)}
                          size="sm"
                          className="h-6 w-6 border-transparent bg-transparent"
                          title={t("addressBar.rename")}
                        >
                          <Pencil size={12} />
                        </IconButton>
                        <IconButton
                          onClick={(e) => handleDeleteAddress(e, addr.id)}
                          size="sm"
                          tone="danger"
                          className="h-6 w-6 border-transparent bg-transparent"
                          title={t("addressBar.delete")}
                        >
                          <Trash2 size={12} />
                        </IconButton>
                      </div>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <div
        className="flex items-center shrink-0 rounded-md focus-within:ring-1 focus-within:ring-[var(--focus-ring)]"
        title={t("addressBar.timeout")}
      >
        <Input
          type="text"
          inputMode="numeric"
          value={tab.timeoutSec}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^0-9]/g, "");
            updateTab(tab.id, { timeoutSec: raw === "" ? (0 as any) : Number(raw) });
          }}
          onBlur={() => {
            const v = Number(tab.timeoutSec);
            if (!v || v < 1 || v > 3600) {
              updateTab(tab.id, { timeoutSec: !v || v < 1 ? 30 : 3600 });
            }
          }}
          className="w-10 bg-[var(--surface-1)] text-xs text-center px-1 py-1.5 rounded-l-md border border-r-0 border-[var(--line-strong)] focus:outline-none text-[var(--text-normal)]"
        />
        <span className="text-xs text-[var(--text-muted)] bg-[var(--surface-1)] border border-l-0 border-[var(--line-strong)] px-1.5 py-[6px] rounded-r-md select-none">
          s
        </span>
      </div>

      <div className="relative" ref={tlsRef}>
        <button
          onClick={() => setShowTls(!showTls)}
          className={cn(
            "p-1.5 rounded-md transition-colors shrink-0",
            tab.useTls
              ? "text-[var(--color-method-unary)] bg-[var(--color-method-unary)]/10 hover:bg-[var(--color-method-unary)]/20"
              : "text-[var(--text-muted)] hover:bg-[var(--surface-1)] hover:text-[var(--text-normal)]"
          )}
          title={tab.useTls ? t("tls.tlsEnabled") : t("tls.tlsDisabled")}
        >
          {tab.useTls ? <Shield size={14} /> : <ShieldOff size={14} />}
        </button>
        {showTls && (
          <div className="absolute top-full right-0 mt-1 bg-[var(--surface-0)] border border-[var(--line-soft)] rounded-md shadow-lg z-50 p-3 w-[280px]">
            <label className="flex items-center gap-2 text-xs cursor-pointer mb-2">
              <input
                type="checkbox"
                checked={tab.useTls ?? false}
                onChange={(e) => updateTab(tab.id, { useTls: e.target.checked })}
                className="rounded"
              />
              {tab.useTls ? (
                <Shield size={13} className="text-[var(--color-method-unary)]" />
              ) : (
                <ShieldOff size={13} className="text-[var(--text-muted)]" />
              )}
              <span className="font-medium">{t("tls.enableTls")}</span>
            </label>
            {tab.useTls && (
              <div className="flex flex-col gap-1.5 pt-1 border-t border-[var(--line-soft)]">
                <CertFileRow label={t("tls.caFile")} value={tab.caPath} notSelected={t("tls.notSelected")} onSelect={async () => {
                  try { const p = await window.go.main.App.SelectCertFile(); if (p) updateTab(tab.id, { caPath: p }); } catch {}
                }} />
                <CertFileRow label={t("tls.certFile")} value={tab.certPath} notSelected={t("tls.notSelected")} onSelect={async () => {
                  try { const p = await window.go.main.App.SelectCertFile(); if (p) updateTab(tab.id, { certPath: p }); } catch {}
                }} />
                <CertFileRow label={t("tls.keyFile")} value={tab.keyPath} notSelected={t("tls.notSelected")} onSelect={async () => {
                  try { const p = await window.go.main.App.SelectCertFile(); if (p) updateTab(tab.id, { keyPath: p }); } catch {}
                }} />
              </div>
            )}
          </div>
        )}
      </div>

      <Button
        className={cn(
          "flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors shrink-0 h-8",
          tab.isLoading
            ? "bg-[var(--state-error)] hover:bg-[var(--state-error)]/80 text-white"
            : "bg-[var(--state-info)] hover:bg-[var(--state-info)]/80 text-white",
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
      </Button>
    </div>
  );
}

function CertFileRow({ label, value, notSelected, onSelect }: { label: string; value: string; notSelected: string; onSelect: () => void }) {
  return (
    <div className="flex items-center gap-1.5 mt-1">
      <span className="text-[10px] text-[var(--text-muted)] w-[70px] shrink-0">{label}</span>
      <div className="flex-1 flex items-center gap-1 bg-[var(--surface-1)] rounded border border-[var(--line-strong)] px-2 py-0.5 text-[10px] min-w-0">
        <FileKey size={10} className="shrink-0 text-[var(--text-muted)]" />
        <span className="truncate text-[var(--text-muted)]">
          {value ? value.split("/").pop() : notSelected}
        </span>
      </div>
      <IconButton
        onClick={onSelect}
        size="sm"
        className="h-6 w-6 border-transparent bg-transparent"
      >
        <FolderOpen size={12} />
      </IconButton>
    </div>
  );
}
