import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "@/store/app-store";
import { mergeMetadata } from "@/lib/metadata-profile";

function getJsonParseErrorMessage(error: unknown, t: (key: string, options?: Record<string, unknown>) => string) {
  const detail = error instanceof Error ? error.message : String(error);
  return t("editor.jsonParseError", { detail });
}

export function useGrpc() {
  const { t } = useTranslation();
  const { activeTabId, tabs, updateTab } = useAppStore();
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
      }
    };
  }, []);

  const send = useCallback(async () => {
    const tab = tabs.find((t) => t.id === activeTabId);
    if (!tab || !tab.method || !tab.projectId) return;

    try {
      JSON.parse(tab.requestBody);
    } catch (error) {
      const message = getJsonParseErrorMessage(error, t);
      window.dispatchEvent(new CustomEvent("rpccall:request-json-error", {
        detail: { tabId: tab.id, message },
      }));
      updateTab(tab.id, {
        isLoading: false,
        responseBody: `Error: ${message}`,
        responseMetadata: [],
        responseTrailers: [],
        statusCode: "ERROR",
        elapsedMs: null,
        timing: null,
      });
      return;
    }

    updateTab(tab.id, {
      isLoading: true,
      responseBody: "",
      responseMetadata: [],
      responseTrailers: [],
      statusCode: null,
      elapsedMs: null,
      timing: null,
    });

    let metadata = tab.metadata;
    try {
      const profile = await window.go.main.App.GetMetadataProfile(tab.address);
      if (profile?.enabled) {
        metadata = mergeMetadata(tab.metadata, profile.metadata.map((m) => ({ ...m, enabled: true })));
      }
    } catch { /* ignore profile load errors and send manual metadata */ }

    const request = {
      projectId: tab.projectId,
      address: tab.address,
      serviceName: tab.method.serviceName,
      methodName: tab.method.methodName,
      body: tab.requestBody,
      metadata: metadata.filter((m) => m.enabled && m.key),
      useTls: tab.useTls,
      certPath: tab.certPath,
      keyPath: tab.keyPath,
      caPath: tab.caPath,
      timeoutSec: tab.timeoutSec,
    };

    try {
      const methodType = tab.method.methodType;

      if (methodType === "unary") {
        const resp: GrpcResponse = await window.go.main.App.InvokeUnary(request);
        updateTab(tab.id, {
          isLoading: false,
          responseBody: resp.error ? `Error: ${resp.error}` : resp.body,
          responseMetadata: resp.headers?.map((h) => ({ ...h, enabled: true })) ?? [],
          responseTrailers: resp.trailers?.map((t) => ({ ...t, enabled: true })) ?? [],
          statusCode: resp.statusCode,
          elapsedMs: resp.elapsedMs,
          timing: resp.timing ?? null,
        });
      } else if (methodType === "client_streaming") {
        const resp: GrpcResponse = await window.go.main.App.InvokeClientStream(request);
        updateTab(tab.id, {
          isLoading: false,
          responseBody: resp.error ? `Error: ${resp.error}` : resp.body,
          responseMetadata: resp.headers?.map((h) => ({ ...h, enabled: true })) ?? [],
          responseTrailers: resp.trailers?.map((t) => ({ ...t, enabled: true })) ?? [],
          statusCode: resp.statusCode,
          elapsedMs: resp.elapsedMs,
          timing: resp.timing ?? null,
        });
      } else if (methodType === "server_streaming" || methodType === "bidi_streaming") {
        let messages: string[] = [];

        const offMessage = window.runtime.EventsOn("stream:message", (msg: string) => {
          messages.push(msg);
          updateTab(tab.id, {
            responseBody: messages.join("\n---\n"),
          });
        });

        const offDone = window.runtime.EventsOn("stream:done", (resp: GrpcResponse) => {
          updateTab(tab.id, {
            isLoading: false,
            responseBody: resp.error
              ? `Error: ${resp.error}`
              : resp.body || messages.join("\n---\n"),
            responseMetadata: resp.headers?.map((h) => ({ ...h, enabled: true })) ?? [],
            responseTrailers: resp.trailers?.map((t) => ({ ...t, enabled: true })) ?? [],
            statusCode: resp.statusCode,
            elapsedMs: resp.elapsedMs,
          });
          offMessage();
          offDone();
        });

        cleanupRef.current = () => {
          offMessage();
          offDone();
        };

        if (methodType === "server_streaming") {
          await window.go.main.App.InvokeServerStream(request);
        } else {
          await window.go.main.App.InvokeBidiStream(request);
        }
      }
    } catch (e: any) {
      const message = e instanceof Error ? e.message : String(e);
      updateTab(tab.id, {
        isLoading: false,
        responseBody: `Error: ${message}`,
        statusCode: "ERROR",
      });
    }
  }, [activeTabId, tabs, updateTab, t]);

  return { send };
}
