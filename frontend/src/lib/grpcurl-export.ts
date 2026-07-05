export interface GrpcurlMethod {
  serviceName: string;
  methodName: string;
  fullName: string;
  methodType: string;
}

export interface GrpcurlExportParams {
  address: string;
  method: GrpcurlMethod;
  body: string;
  metadata: { key: string; value: string }[];
  useTls: boolean;
  certPath: string;
  keyPath: string;
  caPath: string;
}

function buildMethodPath(method: GrpcurlMethod): string {
  const { serviceName, methodName, fullName } = method;
  if (fullName && fullName.endsWith(`.${methodName}`)) {
    const prefix = fullName.slice(0, -methodName.length - 1);
    if (prefix) return `${prefix}/${methodName}`;
  }
  if (fullName && fullName.includes("/")) return fullName;
  if (fullName && fullName.includes(".")) {
    const idx = fullName.lastIndexOf(".");
    return `${fullName.slice(0, idx)}/${fullName.slice(idx + 1)}`;
  }
  return `${serviceName}/${methodName}`;
}

function minifyBody(body: string): string | null {
  const trimmed = body.trim();
  if (!trimmed) return null;
  try {
    return JSON.stringify(JSON.parse(trimmed));
  } catch {
    return null;
  }
}

function shellQuote(value: string): string {
  if (value === "") return "''";
  if (/^[A-Za-z0-9@%+=:,./_-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, "'\\''")}'`;
}

export function buildGrpcurlCommand(params: GrpcurlExportParams): string {
  const { address, method, body, metadata, useTls, certPath, keyPath, caPath } = params;
  const flags: string[] = [];

  if (!useTls) {
    flags.push("-plaintext");
  } else {
    if (!caPath) flags.push("-insecure");
    else flags.push("-cacert", shellQuote(caPath));
    if (certPath && keyPath) {
      flags.push("-cert", shellQuote(certPath), "-key", shellQuote(keyPath));
    } else if (certPath) {
      flags.push("-cert", shellQuote(certPath));
    }
  }

  const enabledMetadata = metadata.filter((m) => m.key.trim());
  for (const m of enabledMetadata) {
    flags.push("-H", shellQuote(`${m.key}: ${m.value}`));
  }

  const minified = minifyBody(body);
  if (minified !== null) {
    flags.push("-d", shellQuote(minified));
  }

  const methodPath = buildMethodPath(method);
  const parts = ["grpcurl", ...flags, shellQuote(address), methodPath];

  const cmd = parts.join(" ");

  const isStreaming =
    method.methodType === "server_streaming" ||
    method.methodType === "client_streaming" ||
    method.methodType === "bidi_streaming";

  if (isStreaming) {
    return `${cmd}  # streaming RPC: use @file or stdin for client-streaming input`;
  }
  return cmd;
}
