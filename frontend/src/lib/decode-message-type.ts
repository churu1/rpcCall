export interface MessageTypeSelection {
  messageType: string;
  protoPath: string;
}

export interface ProtoFileGroup {
  protoPath: string;
  displayPath: string;
  messageCount: number;
}

export function messageShortName(messageType: string): string {
  const trimmed = messageType.trim();
  if (!trimmed) return "";
  const idx = trimmed.lastIndexOf(".");
  return idx >= 0 ? trimmed.slice(idx + 1) : trimmed;
}

export function buildDisplayPaths(allPaths: string[]): Map<string, string> {
  const result = new Map<string, string>();
  for (const p of allPaths) {
    const parts = p.split("/").filter(Boolean);
    result.set(p, parts.slice(-2).join("/") || p);
  }

  let collision = true;
  while (collision) {
    collision = false;
    const groups = new Map<string, string[]>();
    for (const p of allPaths) {
      const display = result.get(p) ?? p;
      const list = groups.get(display) ?? [];
      list.push(p);
      groups.set(display, list);
    }
    for (const [, paths] of groups) {
      if (paths.length <= 1) continue;
      collision = true;
      for (const p of paths) {
        const parts = p.split("/").filter(Boolean);
        const currentLen = (result.get(p) ?? "").split("/").filter(Boolean).length;
        if (currentLen < parts.length) {
          result.set(p, parts.slice(-(currentLen + 1)).join("/"));
        }
      }
    }
  }
  return result;
}

export function buildProtoFileGroups(options: MessageTypeOption[]): ProtoFileGroup[] {
  const counts = new Map<string, number>();
  for (const opt of options) {
    if (!opt.protoPath) continue;
    counts.set(opt.protoPath, (counts.get(opt.protoPath) ?? 0) + 1);
  }
  const paths = [...counts.keys()].sort();
  const displays = buildDisplayPaths(paths);
  return paths.map((protoPath) => ({
    protoPath,
    displayPath: displays.get(protoPath) ?? protoPath,
    messageCount: counts.get(protoPath) ?? 0,
  }));
}

export function formatProtoFileLabel(group: ProtoFileGroup): string {
  return `${group.displayPath} (${group.messageCount})`;
}

export function resolveMessageTypeInProto(
  messageType: string,
  protoPath: string,
  options: MessageTypeOption[],
): string {
  const mt = messageType.trim();
  const path = protoPath.trim();
  if (!mt || !path) return "";
  if (options.some((opt) => opt.messageType === mt && opt.protoPath === path)) {
    return mt;
  }
  return "";
}

export function resolveSelection(
  messageType: string,
  protoPath: string,
  options: MessageTypeOption[],
): MessageTypeSelection {
  const mt = messageType.trim();
  const path = protoPath.trim();

  if (mt && path && options.some((opt) => opt.messageType === mt && opt.protoPath === path)) {
    return { messageType: mt, protoPath: path };
  }

  if (mt && !path) {
    const matches = options.filter((opt) => opt.messageType === mt);
    if (matches.length === 1) {
      return { messageType: mt, protoPath: matches[0].protoPath };
    }
  }

  if (path && !mt) {
    return { messageType: "", protoPath: path };
  }

  return { messageType: "", protoPath: "" };
}

export function messageExistsInProto(
  messageType: string,
  protoPath: string,
  options: MessageTypeOption[],
): boolean {
  const mt = messageType.trim();
  const path = protoPath.trim();
  if (!mt || !path) return false;
  return options.some((opt) => opt.messageType === mt && opt.protoPath === path);
}

export function filterMessagesForProto(
  options: MessageTypeOption[],
  protoPath: string,
): MessageTypeOption[] {
  const path = protoPath.trim();
  if (!path) return [];
  return options
    .filter((opt) => opt.protoPath === path)
    .sort((a, b) => {
      const shortCmp = messageShortName(a.messageType).localeCompare(messageShortName(b.messageType));
      if (shortCmp !== 0) return shortCmp;
      return a.messageType.localeCompare(b.messageType);
    });
}
