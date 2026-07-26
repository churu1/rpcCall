import { useCallback, useEffect, useRef } from "react";
import { useAppStore } from "@/store/app-store";
import { useEnvStore } from "@/store/env-store";
import { mergeMetadata } from "@/lib/metadata-profile";

export function useGrpc() {
  const { activeTabId, tabs, updateTab } = useAppStore();
  const resolveVariables = useEnvStore((s) => s.resolveVariables);
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

    if (tab.metadataJsonError) {
      window.dispatchEvent(new CustomEvent("rpccall:metadata-json-error", {
        detail: { tabId: tab.id, message: tab.metadataJsonError },
      }));
      updateTab(tab.id, {
        isLoading: false,
        responseBody: `Error: ${tab.metadataJsonError}`,
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

    const normalizedAddress = resolveVariables(tab.address).replace(/\s+/g, "");
    if (normalizedAddress !== tab.address) {
      updateTab(tab.id, { address: normalizedAddress });
    }

    let metadata = tab.metadata;
    try {
      const profile = await window.go.main.App.GetMetadataProfile(normalizedAddress);
      if (profile?.enabled) {
        metadata = mergeMetadata(tab.metadata, profile.metadata.map((m) => ({ ...m, enabled: true })));
      }
    } catch { /* ignore profile load errors and send manual metadata */ }

    const resolvedBody = resolveVariables(tab.requestBody);

    const request = {
      projectId: tab.projectId,
      address: normalizedAddress,
      serviceName: tab.method.serviceName,
      methodName: tab.method.methodName,
      body: resolvedBody,
      metadata: metadata
        .filter((m) => m.enabled && m.key)
        .map((m) => ({ key: m.key, value: resolveVariables(m.value) })),
      useTls: tab.useTls,
      certPath: tab.certPath,
      keyPath: tab.keyPath,
      caPath: tab.caPath,
      timeoutSec: tab.timeoutSec,
    };

    try {
      const validationErrors = await window.go.main.App.ValidateRequestBody(request);
      if (validationErrors && validationErrors.length > 0) {
        const first = validationErrors[0];
        const summary = validationErrors.length === 1
          ? first.message
          : `${first.message}，另有 ${validationErrors.length - 1} 个错误`;
        window.dispatchEvent(new CustomEvent("rpccall:request-validation-error", {
          detail: { tabId: tab.id, message: summary, errors: validationErrors },
        }));
        updateTab(tab.id, {
          isLoading: false,
          responseBody: `Error: 请求参数校验失败\n${validationErrors.map((e) => `Line ${e.line}: ${e.message}`).join("\n")}`,
          responseMetadata: [],
          responseTrailers: [],
          statusCode: "ERROR",
          elapsedMs: null,
          timing: null,
        });
        return;
      }
      window.dispatchEvent(new CustomEvent("rpccall:request-validation-error", {
        detail: { tabId: tab.id, message: "", errors: [] },
      }));

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
        window.dispatchEvent(new CustomEvent("rpccall:history-refresh"));
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
        window.dispatchEvent(new CustomEvent("rpccall:history-refresh"));
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
          window.dispatchEvent(new CustomEvent("rpccall:history-refresh"));
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
      window.dispatchEvent(new CustomEvent("rpccall:history-refresh"));
    }
  }, [activeTabId, tabs, updateTab, resolveVariables]);

  return { send };
}
