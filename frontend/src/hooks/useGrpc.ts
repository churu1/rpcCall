import { useCallback, useEffect, useRef } from "react";
import { useAppStore } from "@/store/app-store";

export function useGrpc() {
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

    updateTab(tab.id, {
      isLoading: true,
      responseBody: "",
      responseMetadata: [],
      responseTrailers: [],
      statusCode: null,
      elapsedMs: null,
      timing: null,
    });

    const request = {
      projectId: tab.projectId,
      address: tab.address,
      serviceName: tab.method.serviceName,
      methodName: tab.method.methodName,
      body: tab.requestBody,
      metadata: tab.metadata.filter((m) => m.enabled && m.key),
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
      updateTab(tab.id, {
        isLoading: false,
        responseBody: `Error: ${e?.message || "Unknown error"}`,
        statusCode: "ERROR",
      });
    }
  }, [activeTabId, tabs, updateTab]);

  return { send };
}
