import type { MetadataEntry } from "@/store/app-store";

export interface JsonPathValue {
  path: string;
  value: string;
}

export function stringifyPathValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

export function flattenJsonPaths(value: unknown, prefix = ""): JsonPathValue[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => flattenJsonPaths(item, prefix ? `${prefix}.${index}` : String(index)));
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
      flattenJsonPaths(child, prefix ? `${prefix}.${key}` : key)
    );
  }
  return prefix ? [{ path: prefix, value: stringifyPathValue(value) }] : [];
}

export function getJsonPathValue(payload: unknown, path: string): string {
  const parts = path.split(".").filter(Boolean);
  let current = payload;
  for (const part of parts) {
    if (Array.isArray(current)) {
      const index = Number.parseInt(part, 10);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) return "";
      current = current[index];
    } else if (current && typeof current === "object") {
      if (!(part in (current as Record<string, unknown>))) return "";
      current = (current as Record<string, unknown>)[part];
    } else {
      return "";
    }
  }
  return stringifyPathValue(current);
}

export function parseJsonBody(body: string): unknown | null {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

export function applyMetadataMappings(payload: unknown, mappings: MetadataMapping[]): MetadataEntry[] {
  return mappings
    .filter((mapping) => mapping.enabled && mapping.key.trim() && mapping.path.trim())
    .map((mapping) => {
      const rawValue = getJsonPathValue(payload, mapping.path);
      const template = mapping.template || "{{value}}";
      return {
        key: mapping.key.trim(),
        value: template.replaceAll("{{value}}", rawValue),
        enabled: true,
      };
    })
    .filter((entry) => entry.value !== "");
}

export function mergeMetadata(manual: MetadataEntry[], profile: MetadataEntry[]): MetadataEntry[] {
  const manualKeys = new Set(
    manual
      .filter((entry) => entry.enabled && entry.key.trim())
      .map((entry) => entry.key.toLowerCase())
  );
  const profileEntries = profile.filter((profileEntry) =>
    profileEntry.enabled && profileEntry.key.trim() && !manualKeys.has(profileEntry.key.toLowerCase())
  );
  return [...profileEntries, ...manual];
}

export function defaultMetadataKey(path: string): string {
  const last = path.split(".").filter(Boolean).pop() || path;
  return last.replace(/_/g, "-").toLowerCase();
}
