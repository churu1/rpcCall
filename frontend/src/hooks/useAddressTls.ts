import { useCallback, useEffect, useRef } from "react";

export interface AddressTLSSettings {
  address: string;
  useTls: boolean;
  certPath: string;
  keyPath: string;
  caPath: string;
}

export interface AddressTLSFields {
  useTls: boolean;
  certPath: string;
  keyPath: string;
  caPath: string;
}

export function useAddressTls(
  tabId: string | undefined,
  address: string,
  tls: AddressTLSFields,
  updateTab: (id: string, updates: Partial<AddressTLSFields>) => void,
) {
  const loadedKeyRef = useRef("");
  const loadGenerationRef = useRef(0);

  useEffect(() => {
    const trimmed = address.trim();
    if (!tabId || !trimmed) return;

    const loadKey = `${tabId}:${trimmed}`;
    if (loadedKeyRef.current === loadKey) return;

    const generation = ++loadGenerationRef.current;
    let cancelled = false;

    const timer = window.setTimeout(() => {
      (async () => {
        try {
          const settings = await window.go.main.App.GetAddressTLSSettings(trimmed);
          if (cancelled || generation !== loadGenerationRef.current || !settings) return;
          loadedKeyRef.current = loadKey;
          updateTab(tabId, {
            useTls: settings.useTls,
            certPath: settings.certPath ?? "",
            keyPath: settings.keyPath ?? "",
            caPath: settings.caPath ?? "",
          });
        } catch {
          /* ignore load errors */
        }
      })();
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [tabId, address, updateTab]);

  const saveTlsSettings = useCallback(
    async (updates: Partial<AddressTLSFields> = {}) => {
      const trimmed = address.trim();
      if (!trimmed || !tabId) return;

      const payload: AddressTLSSettings = {
        address: trimmed,
        useTls: updates.useTls ?? tls.useTls,
        certPath: updates.certPath ?? tls.certPath,
        keyPath: updates.keyPath ?? tls.keyPath,
        caPath: updates.caPath ?? tls.caPath,
      };

      try {
        await window.go.main.App.SaveAddressTLSSettings(payload);
        loadedKeyRef.current = `${tabId}:${trimmed}`;
        loadGenerationRef.current += 1;
      } catch {
        /* ignore save errors */
      }
    },
    [address, tabId, tls.useTls, tls.certPath, tls.keyPath, tls.caPath],
  );

  const loadTlsSettingsNow = useCallback(async (addressOverride?: string) => {
    const trimmed = (addressOverride ?? address).trim();
    if (!tabId || !trimmed) return;

    const generation = ++loadGenerationRef.current;
    try {
      const settings = await window.go.main.App.GetAddressTLSSettings(trimmed);
      if (generation !== loadGenerationRef.current || !settings) return;
      loadedKeyRef.current = `${tabId}:${trimmed}`;
      updateTab(tabId, {
        useTls: settings.useTls,
        certPath: settings.certPath ?? "",
        keyPath: settings.keyPath ?? "",
        caPath: settings.caPath ?? "",
      });
    } catch {
      /* ignore load errors */
    }
  }, [address, tabId, updateTab]);

  return { saveTlsSettings, loadTlsSettingsNow };
}
