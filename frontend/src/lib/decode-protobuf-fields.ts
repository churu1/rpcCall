export async function fetchDecodedProtobufFields(
  jsonBody: string,
): Promise<Record<string, unknown>> {
  const res = await window.go.main.App.DecodeJSONProtobufFields(jsonBody);
  if (!res) return {};
  try {
    const parsed = JSON.parse(res) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function replaceDecodedProtobufFields(
  value: unknown,
  decoded: Record<string, unknown>,
): unknown {
  if (typeof value === "string") {
    return decoded[value] !== undefined ? decoded[value] : value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => replaceDecodedProtobufFields(item, decoded));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = replaceDecodedProtobufFields(item, decoded);
    }
    return out;
  }
  return value;
}

export function renderDecodedProtobufJson(
  jsonBody: string,
  decoded: Record<string, unknown>,
): string {
  if (Object.keys(decoded).length === 0) return jsonBody;
  try {
    const parsed = JSON.parse(jsonBody);
    return JSON.stringify(replaceDecodedProtobufFields(parsed, decoded), null, 2);
  } catch {
    return jsonBody;
  }
}
