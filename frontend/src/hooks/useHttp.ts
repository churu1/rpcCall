import { useCallback } from "react";
import { useAppStore } from "@/store/app-store";

export function useHttp() {
  const { activeTabId, tabs, updateTab } = useAppStore();

  const send = useCallback(async () => {
    const tab = tabs.find((t) => t.id === activeTabId);
    if (!tab || tab.tabType !== "http") return;
    if (!tab.httpUrl?.trim()) return;

    updateTab(tab.id, {
      isLoading: true,
      responseBody: "",
      responseMetadata: [],
      responseTrailers: [],
      statusCode: null,
      elapsedMs: null,
    });

    const request = {
      method: tab.httpMethod,
      url: tab.httpUrl.trim(),
      headers: tab.httpHeaders.filter((h) => h.enabled && h.key).map((h) => ({ key: h.key, value: h.value })),
      body: tab.requestBody,
      timeoutSec: tab.timeoutSec || 30,
    };

    try {
      const resp = await window.go.main.App.InvokeHttp(request);
      const statusStr = resp.statusCode > 0 ? String(resp.statusCode) : (resp.error ? "ERROR" : "0");
      updateTab(tab.id, {
        isLoading: false,
        responseBody: resp.error ? `Error: ${resp.error}` : resp.body,
        responseMetadata: (resp.headers ?? []).map((h) => ({ key: h.key, value: h.value, enabled: true })),
        responseTrailers: [],
        statusCode: statusStr,
        elapsedMs: resp.elapsedMs,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      updateTab(tab.id, {
        isLoading: false,
        responseBody: `Error: ${msg}`,
        statusCode: "ERROR",
      });
    }
  }, [activeTabId, tabs, updateTab]);

  return { send };
}
