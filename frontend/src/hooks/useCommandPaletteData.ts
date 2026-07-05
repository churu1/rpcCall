import { useEffect, useMemo } from "react";
import { useAppStore, type ServiceMethod } from "@/store/app-store";
import { filterAndRankMethods } from "@/lib/command-palette-search";
import {
  buildImportFolderGroups,
  indexSourcesByProject,
  protoBasename,
  resolveMethodImportFolder,
} from "@/lib/proto-import-groups";

export interface PaletteMethodItem {
  id: string;
  method: ServiceMethod;
  serviceName: string;
  methodName: string;
  fullName: string;
  methodType: string;
  projectId: string;
  protoPath: string;
  folderKey: string;
  folderLabel: string;
  protoBasename: string;
}

function projectSourcesReady(
  projectId: string,
  status: Record<string, string>,
  sourcesByProject: Record<string, unknown[]>,
): boolean {
  const state = status[projectId];
  if (state === "ready") return true;
  if (state === "loading" && (sourcesByProject[projectId]?.length ?? 0) > 0) return true;
  return false;
}

export function useCommandPaletteData(
  open: boolean,
  scopedProjectId: string | null,
  searchAllProjects: boolean,
  selectedFolderKey: string,
  query: string,
) {
  const protoFiles = useAppStore((s) => s.protoFiles);
  const protoProjects = useAppStore((s) => s.protoProjects);
  const protoSourcesByProject = useAppStore((s) => s.protoSourcesByProject);
  const protoSourcesStatus = useAppStore((s) => s.protoSourcesStatus);
  const ensureProtoSources = useAppStore((s) => s.ensureProtoSources);

  const scopedProjectIds = useMemo(() => {
    if (searchAllProjects) return protoProjects.map((p) => p.id);
    return scopedProjectId ? [scopedProjectId] : [];
  }, [searchAllProjects, scopedProjectId, protoProjects]);

  const projectNameById = useMemo(() => {
    const names: Record<string, string> = {};
    for (const project of protoProjects) names[project.id] = project.name;
    return names;
  }, [protoProjects]);

  useEffect(() => {
    if (!open || scopedProjectIds.length === 0) return;
    ensureProtoSources(scopedProjectIds);
  }, [open, scopedProjectIds, ensureProtoSources]);

  const sourcesReady =
    scopedProjectIds.length > 0 &&
    scopedProjectIds.every((id) => projectSourcesReady(id, protoSourcesStatus, protoSourcesByProject));

  const protoSources = useMemo(
    () => scopedProjectIds.flatMap((id) => protoSourcesByProject[id] ?? []),
    [scopedProjectIds, protoSourcesByProject],
  );

  const sourcesByProject = useMemo(() => indexSourcesByProject(protoSources), [protoSources]);

  const scopedProtoFiles = useMemo(() => {
    if (searchAllProjects) return protoFiles;
    if (!scopedProjectId) return [];
    return protoFiles.filter((f) => f.projectId === scopedProjectId);
  }, [protoFiles, scopedProjectId, searchAllProjects]);

  const allMethods = useMemo<PaletteMethodItem[]>(() => {
    if (!sourcesReady) return [];
    const methods: PaletteMethodItem[] = [];
    for (const file of scopedProtoFiles) {
      const importFolder = resolveMethodImportFolder(file.projectId, file.path, sourcesByProject);
      for (const service of file.services ?? []) {
        for (const method of service.methods ?? []) {
          methods.push({
            id: `${file.projectId}:${file.path}:${method.fullName}`,
            method,
            serviceName: service.name,
            methodName: method.methodName,
            fullName: method.fullName,
            methodType: method.methodType,
            projectId: file.projectId,
            protoPath: file.path,
            folderKey: importFolder.folderKey,
            folderLabel: importFolder.folderLabel,
            protoBasename: protoBasename(file.path),
          });
        }
      }
    }
    return methods;
  }, [scopedProtoFiles, sourcesByProject, sourcesReady]);

  const searchableMethods = allMethods;

  const folderGroups = useMemo(
    () =>
      sourcesReady
        ? buildImportFolderGroups(
            protoFiles,
            protoSources,
            scopedProjectId,
            searchAllProjects,
            projectNameById,
          )
        : [],
    [protoFiles, protoSources, scopedProjectId, searchAllProjects, projectNameById, sourcesReady],
  );

  const selectedFolder = useMemo(
    () => folderGroups.find((group) => group.folderKey === selectedFolderKey) ?? null,
    [folderGroups, selectedFolderKey],
  );

  const { items: filteredMethods, totalMatches: methodMatchTotal } = useMemo(
    () => filterAndRankMethods(searchableMethods, query, selectedFolder),
    [query, searchableMethods, selectedFolder],
  );

  return {
    projectNameById,
    sourcesReady,
    folderGroups,
    filteredMethods,
    methodMatchTotal,
    searchableMethods,
  };
}
