import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppStore } from "@/store/app-store";
import { Plus, Trash2, Play, FolderOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SearchableSelect } from "@/components/ui/SearchableSelect";

interface Props {
  seedPayload?: string;
  seedMessageType?: string;
  seedTick?: number;
  forceBatchTick?: number;
}

type MessageOption = {
  value: string;
  label: string;
  searchExtra: string;
};

const ENCODINGS: DecodeEncoding[] = ["auto", "hex", "base64", "escape", "raw"];

export function DecodePanel({ seedPayload, seedMessageType, seedTick, forceBatchTick }: Props) {
  const { t } = useTranslation();
  const { activeTabId, tabs, protoFiles } = useAppStore();
  const tab = tabs.find((tt) => tt.id === activeTabId);

  const [explicitMessageType, setExplicitMessageType] = useState("");
  const [encoding, setEncoding] = useState<DecodeEncoding>("auto");
  const [singlePayload, setSinglePayload] = useState("");
  const [batchPayload, setBatchPayload] = useState("");
  const [batchMode, setBatchMode] = useState(false);
  const [running, setRunning] = useState(false);
  const [rules, setRules] = useState<NestedDecodeRule[]>([]);
  const [allMessageTypes, setAllMessageTypes] = useState<string[]>([]);
  const [messageFields, setMessageFields] = useState<FieldInfo[]>([]);
  const [fieldsLoading, setFieldsLoading] = useState(false);

  useEffect(() => {
    window.go.main.App.GetAllMessageTypes()
      .then((types) => setAllMessageTypes((types ?? []).filter(Boolean)))
      .catch(() => setAllMessageTypes([]));
  }, [protoFiles]);

  const messageOptions = useMemo<MessageOption[]>(
    () =>
      allMessageTypes
        .map((name) => ({ value: name, label: name, searchExtra: name }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [allMessageTypes]
  );

  useEffect(() => {
    if (seedTick && seedPayload !== undefined) {
      setSinglePayload(seedPayload);
      setExplicitMessageType(seedMessageType || "");
      setBatchMode(false);
      window.dispatchEvent(new CustomEvent("rpccall:decode-output", {
        detail: { result: null, batchResult: null },
      }));
    }
  }, [seedTick, seedPayload, seedMessageType]);

  useEffect(() => {
    if (forceBatchTick) setBatchMode(true);
  }, [forceBatchTick]);

  useEffect(() => {
    if (!explicitMessageType.trim()) {
      setMessageFields([]);
      setFieldsLoading(false);
      return;
    }
    setFieldsLoading(true);
    window.go.main.App.GetMessageTypeFields(explicitMessageType.trim())
      .then((fields) => setMessageFields(fields ?? []))
      .catch(() => setMessageFields([]))
      .finally(() => setFieldsLoading(false));
  }, [explicitMessageType]);

  useEffect(() => {
    const applyHistory = (e: Event) => {
      const custom = e as CustomEvent<DecodeHistoryDetail>;
      const detail = custom.detail;
      if (!detail) return;
      const payload = detail.payloadText || "";
      setExplicitMessageType(detail.messageType || "");
      setEncoding((detail.inputEncoding as DecodeEncoding) || "auto");
      setSinglePayload(payload);
      setBatchPayload(payload);
      setRules(detail.nestedRules || []);
      setBatchMode(false);
    };
    window.addEventListener("rpccall:decode-apply-history", applyHistory as EventListener);
    return () =>
      window.removeEventListener("rpccall:decode-apply-history", applyHistory as EventListener);
  }, []);

  useEffect(() => {
    if (tab?.method?.inputTypeName && !explicitMessageType) {
      setExplicitMessageType(tab.method.inputTypeName);
    }
  }, [tab?.method?.inputTypeName, explicitMessageType]);

  const canDecode = !!explicitMessageType.trim();

  const buildCommon = (): DecodeRequest => ({
    serviceName: "",
    methodName: "",
    target: "message",
    explicitMessageType,
    payload: "",
    encoding,
    nestedRules: rules,
  });

  const runDecode = useCallback(async () => {
    if (!canDecode) return;
    setRunning(true);
    try {
      if (batchMode) {
        const items = batchPayload
          .split("\n")
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        const batchResult = await window.go.main.App.DecodeBatch({
          common: buildCommon(),
          items,
        });
        window.dispatchEvent(new CustomEvent("rpccall:decode-output", {
          detail: { result: null, batchResult },
        }));
        window.dispatchEvent(new CustomEvent("rpccall:decode-history-refresh"));
      } else {
        const result = await window.go.main.App.DecodePayload({
          ...buildCommon(),
          payload: singlePayload,
        });
        window.dispatchEvent(new CustomEvent("rpccall:decode-output", {
          detail: { result, batchResult: null },
        }));
        window.dispatchEvent(new CustomEvent("rpccall:decode-history-refresh"));
      }
    } finally {
      setRunning(false);
    }
  }, [batchMode, batchPayload, canDecode, encoding, explicitMessageType, rules, singlePayload]);

  useEffect(() => {
    const runHandler = () => runDecode();
    document.addEventListener("rpccall:decode-run", runHandler);
    return () => document.removeEventListener("rpccall:decode-run", runHandler);
  }, [runDecode]);

  const handleChooseFile = async () => {
    try {
      const path = await window.go.main.App.SelectDecodeFile();
      if (!path) return;
      setSinglePayload(path);
      setEncoding("raw");
      setBatchMode(false);
    } catch {
      // ignore
    }
  };

  return (
    <div className="h-full flex flex-col min-w-0 p-2 gap-2 bg-[var(--color-background)]" data-decode-panel="true">
      <div className="rounded-lg border bg-[var(--color-card)] p-2 flex flex-col gap-2">
        <SearchableSelect
          value={explicitMessageType}
          options={messageOptions}
          placeholder={t("decode.selectMessage")}
          onChange={(val) => setExplicitMessageType(val)}
          className="w-[430px] max-w-full"
        />

        <div className="grid grid-cols-[auto_auto_auto] gap-2 items-center">
          <select
            value={encoding}
            onChange={(e) => setEncoding(e.target.value as DecodeEncoding)}
            className="bg-[var(--color-secondary)] border rounded px-2 py-1.5 text-xs"
          >
            {ENCODINGS.map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
          <label className="text-xs flex items-center gap-1">
            <input type="checkbox" checked={batchMode} onChange={(e) => setBatchMode(e.target.checked)} />
            {t("decode.batch")}
          </label>
          {!batchMode && (
            <button
              onClick={handleChooseFile}
              className="text-xs flex items-center gap-1 px-2 py-1.5 rounded border hover:bg-[var(--color-secondary)]"
              title={t("decode.chooseFile")}
            >
              <FolderOpen size={12} />
              {t("decode.chooseFile")}
            </button>
          )}
          <button
            onClick={runDecode}
            disabled={!canDecode || running}
            className="flex items-center gap-1 px-3 py-1.5 text-xs rounded bg-[var(--color-primary)] text-white disabled:opacity-50"
          >
            <Play size={12} />
            {running ? t("decode.decoding") : t("decode.decode")}
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 grid grid-rows-[auto_auto_1fr] gap-2">
        <div className="rounded-lg border bg-[var(--color-card)] flex flex-col">
          <div className="px-2 py-1.5 text-[11px] border-b text-[var(--color-muted-foreground)]">
            {t("decode.fieldsTitle")}
          </div>
          <div className="max-h-[140px] overflow-auto">
            {fieldsLoading ? (
              <div className="px-2 py-2 text-[11px] text-[var(--color-muted-foreground)]">{t("decode.loadingFields")}</div>
            ) : messageFields.length === 0 ? (
              <div className="px-2 py-2 text-[11px] text-[var(--color-muted-foreground)]">{t("decode.noFields")}</div>
            ) : (
              messageFields.map((f) => (
                <div key={`${f.name}-${f.typeName}`} className="px-2 py-1 text-[11px] border-b last:border-b-0 flex items-center gap-2">
                  <span className="font-mono">{f.name}</span>
                  <span className="text-[var(--color-muted-foreground)]">{f.typeName}</span>
                  {f.repeated && <span className="text-[10px] px-1 rounded bg-[var(--color-primary)]/20 text-[var(--color-primary)]">repeated</span>}
                  {f.mapEntry && <span className="text-[10px] px-1 rounded bg-[var(--color-primary)]/20 text-[var(--color-primary)]">map</span>}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-lg border bg-[var(--color-card)] p-2 flex flex-col gap-1">
          <div className="text-[11px] text-[var(--color-muted-foreground)]">{t("decode.nestedRules")}</div>
          {rules.map((r, i) => (
            <div key={i} className="flex items-center gap-1">
              <input
                value={r.fieldPath}
                onChange={(e) => setRules((prev) => prev.map((x, idx) => idx === i ? { ...x, fieldPath: e.target.value } : x))}
                placeholder={t("decode.fieldPathPlaceholder")}
                className="flex-1 bg-[var(--color-secondary)] border rounded px-2 py-1 text-xs"
              />
              <input
                value={r.messageType}
                onChange={(e) => setRules((prev) => prev.map((x, idx) => idx === i ? { ...x, messageType: e.target.value } : x))}
                placeholder={t("decode.messageTypePlaceholder")}
                className="flex-1 bg-[var(--color-secondary)] border rounded px-2 py-1 text-xs"
              />
              <button
                onClick={() => setRules((prev) => prev.filter((_, idx) => idx !== i))}
                className="p-1 rounded hover:bg-[var(--color-secondary)] text-[var(--color-muted-foreground)] hover:text-[var(--color-destructive)]"
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
          <button
            onClick={() => setRules((prev) => [...prev, { fieldPath: "", messageType: "" }])}
            className="self-start text-[11px] px-1.5 py-0.5 rounded hover:bg-[var(--color-secondary)] flex items-center gap-1"
          >
            <Plus size={11} /> {t("decode.addRule")}
          </button>
        </div>

        <div className="rounded-lg border bg-[var(--color-card)] flex flex-col min-h-0">
          <div className="px-2 py-1.5 text-[11px] border-b text-[var(--color-muted-foreground)]">
            {batchMode ? t("decode.batchPayloadLabel") : t("decode.payload")}
          </div>
          <textarea
            value={batchMode ? batchPayload : singlePayload}
            onChange={(e) => (batchMode ? setBatchPayload(e.target.value) : setSinglePayload(e.target.value))}
            className="flex-1 min-h-0 bg-transparent text-xs p-2 font-mono resize-none focus:outline-none"
            placeholder={batchMode ? t("decode.batchPayloadPlaceholder") : t("decode.payloadPlaceholder")}
            spellCheck={false}
          />
        </div>
      </div>
    </div>
  );
}
