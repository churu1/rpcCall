export function normalizeSearchText(text: string): string {
  return text
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .toLowerCase()
    .trim();
}

export function tokenizeSearchText(text: string): string[] {
  const n = normalizeSearchText(text);
  return n ? n.split(/\s+/).filter(Boolean) : [];
}

export function subsequenceMatchIndices(text: string, query: string): number[] | null {
  const tLower = text.toLowerCase();
  const qLower = query.toLowerCase().replace(/\s+/g, "");
  if (!qLower) return [];
  const indices: number[] = [];
  let qi = 0;
  for (let ti = 0; ti < tLower.length && qi < qLower.length; ti++) {
    const ch = tLower[ti];
    if (ch === " " || ch === "." || ch === "_" || ch === "/" || ch === "-") continue;
    if (ch === qLower[qi]) {
      indices.push(ti);
      qi++;
    }
  }
  return qi === qLower.length ? indices : null;
}

export function scoreFuzzyText(text: string, query: string): number {
  if (!text) return -1;

  const tLower = text.toLowerCase();
  const qLower = query.toLowerCase().trim();
  if (!qLower) return 0;

  let score = -1;

  if (tLower === qLower) {
    score = Math.max(score, 50000);
  }

  if (tLower.startsWith(qLower)) {
    score = Math.max(score, 40000 - Math.min(tLower.length, 200));
  }

  const containsIdx = tLower.indexOf(qLower);
  if (containsIdx >= 0) {
    score = Math.max(score, 32000 - containsIdx * 30);
  }

  const qTokens = tokenizeSearchText(query);
  const tTokens = tokenizeSearchText(text);
  if (qTokens.length > 0 && tTokens.length > 0) {
    let tokenHit = 0;
    let tokenBonus = 0;
    let searchFrom = 0;
    for (const qt of qTokens) {
      if (!qt) continue;
      let found = -1;
      let prefix = false;
      for (let i = searchFrom; i < tTokens.length; i++) {
        const token = tTokens[i];
        if (token.startsWith(qt)) {
          found = i;
          prefix = true;
          break;
        }
        if (found === -1 && token.includes(qt)) {
          found = i;
        }
      }
      if (found >= 0) {
        tokenHit++;
        tokenBonus += prefix ? 2400 : 1300;
        searchFrom = found + 1;
      }
    }
    if (tokenHit > 0) {
      score = Math.max(score, 18000 + tokenBonus);
      if (tokenHit === qTokens.length) {
        score = Math.max(score, 26000 + tokenBonus);
      }
    }

    const initials = tTokens.map((t) => t[0]).join("");
    const compactQuery = qTokens.join("");
    if (compactQuery && initials.startsWith(compactQuery)) {
      score = Math.max(score, 22000 + compactQuery.length * 200);
    }
  }

  const indices = subsequenceMatchIndices(text, query);
  if (indices) {
    let gapPenalty = 0;
    let consecutive = 0;
    for (let i = 1; i < indices.length; i++) {
      const gap = indices[i] - indices[i - 1] - 1;
      gapPenalty += Math.max(0, gap);
      if (gap === 0) consecutive++;
    }
    score = Math.max(score, 9000 + indices.length * 120 + consecutive * 60 - gapPenalty * 10);
  }

  return score;
}
