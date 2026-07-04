import type { ProtoImportSource, ProtoSourceType } from "@/lib/proto-import-groups";

export type ProtoSourcesLoadStatus = "idle" | "loading" | "ready" | "error";

interface WailsProtoSource {
  id: number;
  projectId: string;
  sourceType: string;
  path: string;
  importPaths?: string[];
}

export function mapWailsProtoSource(src: WailsProtoSource): ProtoImportSource {
  return {
    id: src.id,
    projectId: src.projectId,
    sourceType: src.sourceType as ProtoSourceType,
    path: src.path,
    importPaths: src.importPaths,
  };
}

export async function fetchProtoSources(projectId: string): Promise<ProtoImportSource[]> {
  const srcs = await window.go.main.App.ListProtoSources(projectId);
  return (srcs ?? []).map(mapWailsProtoSource);
}
