import type { ProtoFile } from "@/store/app-store";

export type ProtoSourceType = "directory" | "file" | "reflection";

export interface ProtoImportSource {
  id?: number;
  projectId: string;
  sourceType: ProtoSourceType | string;
  path: string;
  importPaths?: string[];
}

export interface ImportFolderGroup {
  folderKey: string;
  displayPath: string;
  fullPath: string;
  methodCount: number;
}

export interface MethodImportFolder {
  folderKey: string;
  folderLabel: string;
  importPath: string;
}

export function normalizeProtoPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

function comparablePath(path: string): string {
  return normalizeProtoPath(path).toLowerCase();
}

export function protoPathUnderImportRoot(protoPath: string, importRoot: string): boolean {
  const proto = comparablePath(protoPath);
  const root = comparablePath(importRoot);
  if (root.startsWith("reflection://")) {
    return proto === root;
  }
  return proto === root || proto.startsWith(`${root}/`);
}

export function protoBasename(path: string): string {
  const normalized = normalizeProtoPath(path);
  const idx = normalized.lastIndexOf("/");
  return idx >= 0 ? normalized.slice(idx + 1) : normalized;
}

export function indexSourcesByProject(sources: ProtoImportSource[]): Map<string, ProtoImportSource[]> {
  const map = new Map<string, ProtoImportSource[]>();
  for (const source of sources) {
    const list = map.get(source.projectId) ?? [];
    list.push(source);
    map.set(source.projectId, list);
  }
  return map;
}

export function importSourceDisplayName(source: Pick<ProtoImportSource, "sourceType" | "path">): string {
  const normalized = normalizeProtoPath(source.path);
  if (normalized.startsWith("reflection://")) {
    return normalized.replace("reflection://", "reflection: ");
  }
  const base = protoBasename(normalized);
  if (source.sourceType === "file" && base.endsWith(".proto")) {
    return base.slice(0, -".proto".length);
  }
  return base;
}

export function importFolderKey(projectId: string, source: Pick<ProtoImportSource, "id" | "sourceType" | "path">): string {
  if (source.id != null) {
    return `${projectId}|src:${source.id}`;
  }
  return `${projectId}|${source.sourceType}|${normalizeProtoPath(source.path)}`;
}

export function findImportSourceForProto(
  protoPath: string,
  sources: ProtoImportSource[],
): ProtoImportSource | null {
  const normalized = normalizeProtoPath(protoPath);
  if (normalized.startsWith("reflection://")) {
    return {
      projectId: "",
      sourceType: "reflection",
      path: normalized,
    };
  }

  let best: ProtoImportSource | null = null;
  let bestLen = -1;

  for (const source of sources) {
    const srcPath = normalizeProtoPath(source.path);
    if (source.sourceType === "directory") {
      if (protoPathUnderImportRoot(protoPath, srcPath)) {
        if (srcPath.length > bestLen) {
          best = source;
          bestLen = srcPath.length;
        }
      }
      continue;
    }
    if (source.sourceType === "file" && comparablePath(protoPath) === comparablePath(srcPath)) {
      return source;
    }
  }

  return best;
}

export function resolveMethodImportFolder(
  projectId: string,
  protoPath: string,
  sourcesByProject: Map<string, ProtoImportSource[]>,
): MethodImportFolder {
  const normalized = normalizeProtoPath(protoPath);
  if (normalized.startsWith("reflection://")) {
    return {
      folderKey: `${projectId}|reflection|${normalized}`,
      folderLabel: importSourceDisplayName({ sourceType: "reflection", path: normalized }),
      importPath: normalized,
    };
  }

  const projectSources = sourcesByProject.get(projectId) ?? [];
  const matched = findImportSourceForProto(protoPath, projectSources);
  if (matched) {
    const withProject = { ...matched, projectId };
    return {
      folderKey: importFolderKey(projectId, withProject),
      folderLabel: importSourceDisplayName(withProject),
      importPath: normalizeProtoPath(withProject.path),
    };
  }

  const parent = normalized.includes("/") ? normalized.slice(0, normalized.lastIndexOf("/")) : "";
  return {
    folderKey: `${projectId}|orphan|${parent || normalized}`,
    folderLabel: parent ? protoBasename(parent) : protoBasename(normalized),
    importPath: parent || normalized,
  };
}

export function buildImportFolderGroups(
  protoFiles: ProtoFile[],
  sources: ProtoImportSource[],
  projectId: string | null | undefined,
  searchAllProjects: boolean,
  projectNameById: Record<string, string>,
): ImportFolderGroup[] {
  const files = searchAllProjects
    ? protoFiles
    : projectId
      ? protoFiles.filter((f) => f.projectId === projectId)
      : [];

  const scopedSources = searchAllProjects
    ? sources
    : projectId
      ? sources.filter((s) => s.projectId === projectId)
      : [];

  const sourcesByProject = indexSourcesByProject(scopedSources);
  const groups = new Map<string, ImportFolderGroup>();

  for (const source of scopedSources) {
    const folderKey = importFolderKey(source.projectId, source);
    if (groups.has(folderKey)) continue;
    const label = importSourceDisplayName(source);
    groups.set(folderKey, {
      folderKey,
      displayPath: searchAllProjects
        ? `${projectNameById[source.projectId] ?? source.projectId} · ${label}`
        : label,
      fullPath: normalizeProtoPath(source.path),
      methodCount: 0,
    });
  }

  for (const file of files) {
    const folder = resolveMethodImportFolder(file.projectId, file.path, sourcesByProject);
    let group = groups.get(folder.folderKey);
    if (!group) {
      group = {
        folderKey: folder.folderKey,
        displayPath: searchAllProjects
          ? `${projectNameById[file.projectId] ?? file.projectId} · ${folder.folderLabel}`
          : folder.folderLabel,
        fullPath: folder.importPath,
        methodCount: 0,
      };
      groups.set(folder.folderKey, group);
    }
    for (const service of file.services ?? []) {
      group.methodCount += service.methods?.length ?? 0;
    }
  }

  return [...groups.values()]
    .filter((g) => g.methodCount > 0)
    .sort((a, b) => a.displayPath.localeCompare(b.displayPath));
}

export function methodBelongsToImportFolder(
  item: { folderKey: string; protoPath: string },
  folder: Pick<ImportFolderGroup, "folderKey" | "fullPath">,
): boolean {
  if (item.folderKey === folder.folderKey) return true;
  return protoPathUnderImportRoot(item.protoPath, folder.fullPath);
}
