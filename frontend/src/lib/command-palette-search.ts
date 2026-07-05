import { scoreFuzzyText, tokenizeSearchText } from "@/lib/fuzzy-search";
import type { ImportFolderGroup } from "@/lib/proto-import-groups";
import { methodBelongsToImportFolder } from "@/lib/proto-import-groups";

export const COMMAND_PALETTE_METHOD_LIMIT = 100;

/** Lowercase + strip separators — all matching is case-insensitive. */
export function compactAlpha(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function subsequenceCompact(compactText: string, compactQuery: string): boolean {
  if (!compactQuery) return false;
  let qi = 0;
  for (let i = 0; i < compactText.length && qi < compactQuery.length; i++) {
    if (compactText[i] === compactQuery[qi]) qi++;
  }
  return qi === compactQuery.length;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array<number>(n + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }

  return prev[n];
}

/** Tolerate small typos on compact strings, e.g. exportex → reportex → ReportExternalShare. */
export function scoreCompactTypo(text: string, query: string): number {
  const t = compactAlpha(text);
  const q = compactAlpha(query);
  if (!q || q.length < 4 || !t) return -1;

  const maxDist = q.length <= 6 ? 1 : q.length <= 10 ? 2 : 3;
  let best = -1;

  const scoreFor = (distance: number, index: number) =>
    15000 + (maxDist - distance) * 1800 - distance * 120 - index * 8;

  const prefix = t.slice(0, q.length);
  if (prefix.length === q.length) {
    const distance = levenshtein(q, prefix);
    if (distance <= maxDist) {
      best = Math.max(best, scoreFor(distance, 0));
    }
  }

  if (t.length >= q.length) {
    for (let i = 0; i <= t.length - q.length; i++) {
      const distance = levenshtein(q, t.slice(i, i + q.length));
      if (distance <= maxDist) {
        best = Math.max(best, scoreFor(distance, i));
      }
    }
  }

  return best;
}

/** Ignore case and camelCase boundaries: reportexternal → ReportExternalShare. */
export function scoreCompactAlpha(text: string, query: string): number {
  const t = compactAlpha(text);
  const q = compactAlpha(query);
  if (!q || !t) return -1;

  let best = -1;

  if (t === q) {
    best = Math.max(best, 48000);
  }
  if (t.startsWith(q)) {
    best = Math.max(best, 46000 + q.length * 150 - Math.min(t.length - q.length, 120));
  }

  const idx = t.indexOf(q);
  if (idx >= 0) {
    best = Math.max(best, 38000 - idx * 15);
  }

  if (q.length >= 3 && subsequenceCompact(t, q)) {
    best = Math.max(best, 14000 + q.length * 90);
  }

  return best;
}

/** Match query as prefix of any PascalCase word (case-insensitive). */
export function scoreCamelCaseSegments(text: string, query: string): number {
  const q = compactAlpha(query);
  if (!q) return -1;

  const segments = tokenizeSearchText(text);
  if (segments.length === 0) return -1;

  let best = -1;

  for (const segment of segments) {
    if (segment.startsWith(q)) {
      best = Math.max(best, 40000 + q.length * 120 - (segment.length - q.length));
    }
    const idx = segment.indexOf(q);
    if (idx >= 0) {
      best = Math.max(best, 34000 - idx * 20);
    }
  }

  for (let i = 0; i < segments.length; i++) {
    let joined = "";
    for (let j = i; j < segments.length; j++) {
      joined += segments[j];
      if (joined.startsWith(q)) {
        best = Math.max(best, 42000 + q.length * 100 - i * 60 - (joined.length - q.length));
      }
      const joinedIdx = joined.indexOf(q);
      if (joinedIdx >= 0) {
        best = Math.max(best, 36000 - joinedIdx * 15 - i * 40);
      }
    }
  }

  return best;
}

function methodPrefixMatchLength(methodName: string, queryCompact: string): number {
  const methodCompact = compactAlpha(methodName);
  if (!queryCompact || !methodCompact.startsWith(queryCompact)) return 0;
  return queryCompact.length;
}

export function scoreMethodSearch(methodName: string, serviceName: string, query: string): number {
  const q = query.trim();
  if (!q) return -1;

  let score = -1;
  const bump = (value: number) => {
    score = Math.max(score, value);
  };

  const methodCompact = scoreCompactAlpha(methodName, q);
  if (methodCompact >= 0) bump(methodCompact + 12000);

  const segmentScore = scoreCamelCaseSegments(methodName, q);
  if (segmentScore >= 0) bump(segmentScore + 8000);

  const fuzzyMethod = scoreFuzzyText(methodName, q);
  if (fuzzyMethod >= 0) bump(fuzzyMethod + 6000);

  const combined = `${serviceName}/${methodName}`;
  const combinedSpaced = `${serviceName} ${methodName}`;

  const combinedCompact = scoreCompactAlpha(combined, q);
  if (combinedCompact >= 0) bump(combinedCompact + 7000);

  const combinedSegment = scoreCamelCaseSegments(combinedSpaced, q);
  if (combinedSegment >= 0) bump(combinedSegment + 5000);

  const fuzzyCombined = scoreFuzzyText(combined, q);
  if (fuzzyCombined >= 0) bump(fuzzyCombined + 4000);

  const serviceCompact = scoreCompactAlpha(serviceName, q);
  if (serviceCompact >= 0) bump(serviceCompact + 3000);

  const fuzzyService = scoreFuzzyText(serviceName, q);
  if (fuzzyService >= 0) bump(fuzzyService + 2000);

  return score;
}

export function filterAndRankMethods<
  T extends { methodName: string; serviceName: string; folderKey: string; protoPath: string },
>(
  items: T[],
  query: string,
  folder: Pick<ImportFolderGroup, "folderKey" | "fullPath"> | null,
): { items: T[]; totalMatches: number } {
  const scoped = folder ? items.filter((item) => methodBelongsToImportFolder(item, folder)) : items;
  const q = query.trim();
  const qCompact = compactAlpha(q);
  if (!qCompact) return { items: [], totalMatches: 0 };

  const ranked = scoped
    .map((item) => ({
      item,
      score: scoreMethodSearch(item.methodName, item.serviceName, q),
      prefixLen: methodPrefixMatchLength(item.methodName, qCompact),
    }))
    .filter((x) => x.score >= 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.prefixLen !== a.prefixLen) return b.prefixLen - a.prefixLen;
      const serviceCmp = a.item.serviceName.localeCompare(b.item.serviceName, undefined, { sensitivity: "base" });
      if (serviceCmp !== 0) return serviceCmp;
      return a.item.methodName.localeCompare(b.item.methodName, undefined, { sensitivity: "base" });
    });

  return {
    items: ranked.slice(0, COMMAND_PALETTE_METHOD_LIMIT).map((x) => x.item),
    totalMatches: ranked.length,
  };
}
