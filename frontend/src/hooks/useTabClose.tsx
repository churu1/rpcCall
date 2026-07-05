import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore, type Tab } from "@/store/app-store";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

type PendingClose =
  | { kind: "single"; id: string }
  | { kind: "bulk"; ids: string[] };

export function useTabClose() {
  const { t } = useTranslation();
  const removeTab = useAppStore((s) => s.removeTab);
  const removeTabsByIds = useAppStore((s) => s.removeTabsByIds);
  const [pending, setPending] = useState<PendingClose | null>(null);

  const isDirty = (tab: Tab): boolean => !!tab.isDirty && tab.collectionRequestId !== undefined;

  const requestClose = (id: string) => {
    const tab = useAppStore.getState().tabs.find((t) => t.id === id);
    if (!tab) return;
    if (isDirty(tab)) {
      setPending({ kind: "single", id });
    } else {
      removeTab(id);
    }
  };

  const requestCloseByIds = (ids: string[]) => {
    const tabs = useAppStore.getState().tabs;
    const dirtyCount = ids.filter((id) => {
      const tab = tabs.find((t) => t.id === id);
      return tab ? isDirty(tab) : false;
    }).length;
    if (dirtyCount === 0) {
      removeTabsByIds(ids);
    } else {
      setPending({ kind: "bulk", ids });
    }
  };

  const confirm = () => {
    if (!pending) return;
    if (pending.kind === "single") {
      removeTab(pending.id);
    } else {
      removeTabsByIds(pending.ids);
    }
    setPending(null);
  };

  const cancel = () => setPending(null);

  const dialog = pending ? (
    <ConfirmDialog
      title={t("tab.unsavedTitle")}
      message={
        pending.kind === "single"
          ? t("tab.unsavedMessage")
          : t("tab.unsavedBulkMessage", { count: pending.ids.length })
      }
      confirmLabel={t("tab.closeWithoutSaving")}
      cancelLabel={t("common.cancel")}
      variant="danger"
      onConfirm={confirm}
      onCancel={cancel}
    />
  ) : null;

  return { requestClose, requestCloseByIds, dialog };
}
