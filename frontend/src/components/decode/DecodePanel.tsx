import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppStore } from "@/store/app-store";
import { Plus, Trash2, Play, FolderOpen, Save } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Card } from "@/components/ui/Card";
import {
  buildProtoFileGroups,
  filterMessagesForProto,
  formatProtoFileLabel,
  messageExistsInProto,
  messageShortName,
  resolveSelection,
} from "@/lib/decode-message-type";

interface Props {
  seedPayload?: string;
  seedMessageType?: string;
  seedTick?: number;
  forceBatchTick?: number;
}

const ENCODINGS: DecodeEncoding[] = ["auto", "hex", "base64", "escape", "raw"];

export function DecodePanel({ seedPayload, seedMessageType, seedTick, forceBatchTick }: Props) {
  const { t } = useTranslation();
  const { activeTabId, tabs, protoFiles, activeProjectId, updateTab } = useAppStore();
  const tab = tabs.find((tt) => tt.id === activeTabId);
  const currentProjectId = tab?.projectId || activeProjectId || "";

  const [selectedProtoPath, setSelectedProtoPath] = useState("");
  const [selectedMessageType, setSelectedMessageType] = useState("");
  const [encoding, setEncoding] = useState<DecodeEncoding>("auto");
  const [singlePayload, setSinglePayload] = useState("");
  const [batchPayload, setBatchPayload] = useState("");
  const [batchMode, setBatchMode] = useState(false);
  const [running, setRunning] = useState(false);
  const [rules, setRules] = useState<NestedDecodeRule[]>([]);
  const [messageTypeOptions, setMessageTypeOptions] = useState<MessageTypeOption[]>([]);
  const [messageFields, setMessageFields] = useState<FieldInfo[]>([]);
  const [fieldsLoading, setFieldsLoading] = useState(false);
  const [templates, setTemplates] = useState<DecodeTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templateName, setTemplateName] = useState("");

  useEffect(() => {
    if (!currentProjectId) {
      setMessageTypeOptions([]);
      return;
    }
    window.go.main.App.ListMessageTypeOptions(currentProjectId)
      .then((options) => setMessageTypeOptions((options ?? []).filter((opt) => opt.messageType && opt.protoPath)))
      .catch(() => setMessageTypeOptions([]));
  }, [protoFiles, currentProjectId]);

  useEffect(() => {
    if (!tab?.id || tab.projectId || !activeProjectId) return;
    updateTab(tab.id, { projectId: activeProjectId });
  }, [tab?.id, tab?.projectId, activeProjectId, updateTab]);

  const loadTemplates = useCallback(async () => {
    if (!currentProjectId) {
      setTemplates([]);
      setSelectedTemplateId("");
      return;
    }
    try {
      const items = await window.go.main.App.ListDecodeTemplates(currentProjectId, 200);
      setTemplates(items || []);
    } catch {
      setTemplates([]);
    }
  }, [currentProjectId]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  useEffect(() => {
    setSelectedTemplateId("");
  }, [currentProjectId]);

  const hasSelectedTemplate = useMemo(
    () => templates.some((tpl) => String(tpl.id) === selectedTemplateId),
    [templates, selectedTemplateId],
  );

  const protoFileGroups = useMemo(
    () => buildProtoFileGroups(messageTypeOptions),
    [messageTypeOptions],
  );

  const protoSelectOptions = useMemo(
    () =>
      protoFileGroups.map((group) => ({
        value: group.protoPath,
        label: formatProtoFileLabel(group),
        searchExtra: group.protoPath,
        title: group.protoPath,
      })),
    [protoFileGroups],
  );

  const messagesInSelectedProto = useMemo(
    () => filterMessagesForProto(messageTypeOptions, selectedProtoPath),
    [messageTypeOptions, selectedProtoPath],
  );

  const messageSelectOptions = useMemo(
    () =>
      messagesInSelectedProto.map((opt) => ({
        value: opt.messageType,
        label: messageShortName(opt.messageType),
        searchExtra: opt.messageType,
        title: opt.messageType,
      })),
    [messagesInSelectedProto],
  );

  const applySelection = useCallback((messageType: string, protoPath: string) => {
    const resolved = resolveSelection(messageType, protoPath, messageTypeOptions);
    setSelectedProtoPath(resolved.protoPath);
    setSelectedMessageType(resolved.messageType);
  }, [messageTypeOptions]);

  useEffect(() => {
    if (seedTick && seedPayload !== undefined) {
      setSinglePayload(seedPayload);
      applySelection(seedMessageType || "", "");
      setBatchMode(false);
      window.dispatchEvent(new CustomEvent("rpccall:decode-output", {
        detail: { result: null, batchResult: null },
      }));
    }
  }, [seedTick, seedPayload, seedMessageType, applySelection]);

  useEffect(() => {
    if (forceBatchTick) setBatchMode(true);
  }, [forceBatchTick]);

  useEffect(() => {
    if (!selectedMessageType.trim()) {
      setMessageFields([]);
      setFieldsLoading(false);
      return;
    }
    if (!selectedProtoPath.trim() || !currentProjectId) {
      setMessageFields([]);
      setFieldsLoading(false);
      return;
    }
    setFieldsLoading(true);
    window.go.main.App.GetMessageTypeFields(
      currentProjectId,
      selectedMessageType.trim(),
      selectedProtoPath.trim(),
    )
      .then((fields) => setMessageFields(fields ?? []))
      .catch(() => setMessageFields([]))
      .finally(() => setFieldsLoading(false));
  }, [selectedMessageType, selectedProtoPath, currentProjectId]);

  useEffect(() => {
    const applyHistory = (e: Event) => {
      const custom = e as CustomEvent<DecodeHistoryDetail>;
      const detail = custom.detail;
      if (!detail) return;
      applySelection(detail.messageType || "", detail.protoPath || "");
      setEncoding((detail.inputEncoding as DecodeEncoding) || "auto");
      setSinglePayload(detail.payloadText || "");
      setBatchPayload(detail.payloadText || "");
      setRules(detail.nestedRules || []);
      setBatchMode(false);
    };
    window.addEventListener("rpccall:decode-apply-history", applyHistory as EventListener);
    return () =>
      window.removeEventListener("rpccall:decode-apply-history", applyHistory as EventListener);
  }, [applySelection]);

  useEffect(() => {
    if (!currentProjectId || !tab?.method) return;
    if (selectedProtoPath || selectedMessageType) return;

    window.go.main.App.ResolveMethodInputMessage(
      currentProjectId,
      tab.method.serviceName,
      tab.method.methodName,
    )
      .then((opt) => {
        if (opt) {
          applySelection(opt.messageType, opt.protoPath);
          return;
        }
        if (tab.method?.inputTypeName) {
          applySelection(tab.method.inputTypeName, "");
        }
      })
      .catch(() => {
        if (tab.method?.inputTypeName) {
          applySelection(tab.method.inputTypeName, "");
        }
      });
  }, [
    currentProjectId,
    tab?.method?.serviceName,
    tab?.method?.methodName,
    tab?.method?.inputTypeName,
    selectedProtoPath,
    selectedMessageType,
    applySelection,
  ]);

  const handleProtoChange = (protoPath: string) => {
    setSelectedProtoPath(protoPath);
    if (!selectedMessageType) return;
    if (messageExistsInProto(selectedMessageType, protoPath, messageTypeOptions)) {
      return;
    }
    setSelectedMessageType("");
  };

  const canDecode =
    !!selectedMessageType.trim() &&
    !!selectedProtoPath.trim() &&
    !!currentProjectId;

  const buildCommon = (): DecodeRequest => ({
    projectId: currentProjectId,
    serviceName: "",
    methodName: "",
    target: "message",
    explicitMessageType: selectedMessageType,
    explicitMessageProtoPath: selectedProtoPath,
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
  }, [
    batchMode,
    batchPayload,
    canDecode,
    encoding,
    selectedMessageType,
    selectedProtoPath,
    rules,
    singlePayload,
    currentProjectId,
  ]);

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

  const applyTemplate = useCallback((tpl: DecodeTemplate) => {
    applySelection(tpl.messageType || "", tpl.protoPath || "");
    setEncoding((tpl.encoding as DecodeEncoding) || "auto");
    setRules(tpl.nestedRules || []);
    setBatchMode(!!tpl.batchMode);
    setTemplateName(tpl.name || "");
    const payload = tpl.payloadText || "";
    setSinglePayload(payload);
    setBatchPayload(payload);
  }, [applySelection]);

  const handleSaveTemplate = useCallback(async () => {
    if (!currentProjectId || !selectedMessageType.trim() || !selectedProtoPath.trim()) return;
    const name =
      templateName.trim() ||
      `${messageShortName(selectedMessageType)}${batchMode ? " (batch)" : ""}`;
    try {
      if (!window.go?.main?.App?.SaveDecodeTemplate) {
        window.alert("SaveDecodeTemplate API not available, please restart dev/build.");
        return;
      }
      const payload = batchMode ? batchPayload : singlePayload;
      const created = await window.go.main.App.SaveDecodeTemplate(
        currentProjectId,
        name,
        selectedMessageType,
        selectedProtoPath,
        encoding,
        batchMode,
        payload,
        rules,
      );
      await loadTemplates();
      if (created?.id) {
        setSelectedTemplateId(String(created.id));
      }
    } catch (e: any) {
      const msg = typeof e === "string" ? e : (e?.message || String(e));
      window.alert(`保存模板失败: ${msg}`);
    }
  }, [
    currentProjectId,
    templateName,
    selectedMessageType,
    selectedProtoPath,
    batchMode,
    batchPayload,
    singlePayload,
    encoding,
    rules,
    loadTemplates,
  ]);

  const handleDeleteTemplate = useCallback(async () => {
    const id = Number(selectedTemplateId);
    if (!id) return;
    try {
      await window.go.main.App.DeleteDecodeTemplate(id);
      setSelectedTemplateId("");
      await loadTemplates();
    } catch {
      // ignore
    }
  }, [selectedTemplateId, loadTemplates]);

  const updateNestedRuleMessage = (index: number, messageType: string) => {
    setRules((prev) =>
      prev.map((rule, idx) =>
        idx === index
          ? {
              ...rule,
              messageType,
              protoPath: selectedProtoPath || rule.protoPath || "",
            }
          : rule,
      ),
    );
  };

  const addNestedRule = () => {
    setRules((prev) => [
      ...prev,
      { fieldPath: "", messageType: "", protoPath: selectedProtoPath || "" },
    ]);
  };

  const selectedProtoDisplay =
    protoFileGroups.find((g) => g.protoPath === selectedProtoPath)?.displayPath ??
    selectedProtoPath.split("/").slice(-2).join("/");

  return (
    <div className="h-full flex flex-col min-w-0 p-2 gap-2 bg-[var(--surface-0)]" data-decode-panel="true">
      <Card className="p-2 flex flex-col gap-2">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <SearchableSelect
            value={selectedProtoPath}
            options={protoSelectOptions}
            placeholder={t("decode.selectProtoFile")}
            onChange={handleProtoChange}
            disabled={!currentProjectId || protoSelectOptions.length === 0}
            className="min-w-0"
          />
          <SearchableSelect
            value={selectedMessageType}
            options={messageSelectOptions}
            placeholder={t("decode.selectMessage")}
            onChange={setSelectedMessageType}
            disabled={!selectedProtoPath}
            className="min-w-0"
          />
        </div>
        {selectedProtoPath && !selectedMessageType && (
          <p className="text-[10px] text-[var(--text-muted)]">{t("decode.pickMessageInProto")}</p>
        )}

        <div className="grid grid-cols-[1.2fr_1fr_auto_auto] gap-2 items-center">
          <Select
            value={selectedTemplateId}
            onChange={(e) => {
              const id = e.target.value;
              setSelectedTemplateId(id);
              const hit = templates.find((tpl) => String(tpl.id) === id);
              if (hit) applyTemplate(hit);
            }}
            className="text-xs"
            disabled={!currentProjectId}
          >
            <option value="">{t("decode.selectTemplate")}</option>
            {templates.map((tpl) => (
              <option key={tpl.id} value={String(tpl.id)}>
                {tpl.name}
              </option>
            ))}
          </Select>
          <Input
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            placeholder={t("decode.templateNamePlaceholder")}
            className="text-xs min-w-0"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />
          <Button
            onClick={handleSaveTemplate}
            disabled={!currentProjectId || !selectedMessageType.trim() || !selectedProtoPath.trim()}
            size="sm"
            title={t("decode.saveTemplate")}
          >
            <Save size={12} />
            {t("decode.saveTemplate")}
          </Button>
          <Button
            onClick={handleDeleteTemplate}
            disabled={!hasSelectedTemplate}
            variant="danger"
            size="sm"
            className="px-2"
            title={t("decode.deleteTemplate")}
          >
            <Trash2 size={12} />
          </Button>
        </div>

        <div className="grid grid-cols-[auto_auto_auto] gap-2 items-center">
          <Select
            value={encoding}
            onChange={(e) => setEncoding(e.target.value as DecodeEncoding)}
            className="text-xs"
          >
            {ENCODINGS.map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </Select>
          <label className="text-xs flex items-center gap-1">
            <input type="checkbox" checked={batchMode} onChange={(e) => setBatchMode(e.target.checked)} />
            {t("decode.batch")}
          </label>
          {!batchMode && (
            <Button
              onClick={handleChooseFile}
              size="sm"
              title={t("decode.chooseFile")}
            >
              <FolderOpen size={12} />
              {t("decode.chooseFile")}
            </Button>
          )}
          <Button
            onClick={runDecode}
            disabled={!canDecode || running}
            variant="primary"
            size="sm"
          >
            <Play size={12} />
            {running ? t("decode.decoding") : t("decode.decode")}
          </Button>
        </div>
      </Card>

      <div className="flex-1 min-h-0 grid grid-rows-[auto_auto_1fr] gap-2">
        <Card className="flex flex-col">
          <div className="px-2 py-1.5 text-[11px] border-b text-[var(--text-muted)]">
            {t("decode.fieldsTitle")}
            {selectedMessageType && (
              <span className="ml-2 font-mono text-[10px] opacity-80">
                {messageShortName(selectedMessageType)}
                {selectedProtoDisplay ? ` · ${selectedProtoDisplay}` : ""}
              </span>
            )}
          </div>
          <div className="max-h-[140px] overflow-auto">
            {fieldsLoading ? (
              <div className="px-2 py-2 text-[11px] text-[var(--text-muted)]">{t("decode.loadingFields")}</div>
            ) : messageFields.length === 0 ? (
              <div className="px-2 py-2 text-[11px] text-[var(--text-muted)]">{t("decode.noFields")}</div>
            ) : (
              messageFields.map((f) => (
                <div key={`${f.name}-${f.typeName}`} className="px-2 py-1 text-[11px] border-b last:border-b-0 flex items-center gap-2">
                  <span className="text-[10px] px-1 rounded bg-[var(--surface-1)] text-[var(--text-muted)] font-mono">
                    #{f.fieldNumber}
                  </span>
                  <span className="font-mono">{f.name}</span>
                  <span className="text-[var(--text-muted)]">{f.typeName}</span>
                  {f.repeated && <span className="text-[10px] px-1 rounded bg-[var(--state-info)]/20 text-[var(--state-info)]">repeated</span>}
                  {f.mapEntry && <span className="text-[10px] px-1 rounded bg-[var(--state-info)]/20 text-[var(--state-info)]">map</span>}
                </div>
              ))
            )}
          </div>
        </Card>

        <Card className="p-2 flex flex-col gap-1">
          <div className="text-[11px] text-[var(--text-muted)]">{t("decode.nestedRules")}</div>
          {rules.map((r, i) => (
            <div key={i} className="flex items-center gap-1">
              <Input
                value={r.fieldPath}
                onChange={(e) => setRules((prev) => prev.map((x, idx) => idx === i ? { ...x, fieldPath: e.target.value } : x))}
                placeholder={t("decode.fieldPathPlaceholder")}
                className="flex-1 h-7 text-xs"
              />
              <SearchableSelect
                value={r.messageType}
                options={messageSelectOptions}
                placeholder={t("decode.messageTypePlaceholder")}
                onChange={(val) => updateNestedRuleMessage(i, val)}
                disabled={!selectedProtoPath}
                className="flex-1"
              />
              <Button
                onClick={() => setRules((prev) => prev.filter((_, idx) => idx !== i))}
                variant="danger"
                size="sm"
                className="h-7 w-7 px-0"
              >
                <Trash2 size={11} />
              </Button>
            </div>
          ))}
          <Button
            onClick={addNestedRule}
            variant="ghost"
            size="sm"
            className="self-start"
            disabled={!selectedProtoPath}
          >
            <Plus size={11} /> {t("decode.addRule")}
          </Button>
        </Card>

        <Card className="flex flex-col min-h-0">
          <div className="px-2 py-1.5 text-[11px] border-b text-[var(--text-muted)]">
            {batchMode ? t("decode.batchPayloadLabel") : t("decode.payload")}
          </div>
          <textarea
            value={batchMode ? batchPayload : singlePayload}
            onChange={(e) => (batchMode ? setBatchPayload(e.target.value) : setSinglePayload(e.target.value))}
            className="flex-1 min-h-0 bg-transparent text-xs p-2 font-mono resize-none focus:outline-none"
            placeholder={batchMode ? t("decode.batchPayloadPlaceholder") : t("decode.payloadPlaceholder")}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
          />
        </Card>
      </div>
    </div>
  );
}
