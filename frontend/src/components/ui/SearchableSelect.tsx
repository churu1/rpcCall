import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { ChevronDown, Search } from "lucide-react";
import {
  normalizeSearchText,
  scoreFuzzyText,
  subsequenceMatchIndices,
} from "@/lib/fuzzy-search";

export interface SearchableSelectOption {
  value: string;
  label: string;
  searchExtra?: string;
  title?: string;
  badge?: string;
}

interface IndexedOption extends SearchableSelectOption {
  searchBlob: string;
}

interface Props {
  value: string;
  options: SearchableSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  className?: string;
  maxResults?: number;
  debounceMs?: number;
  emptyQueryLimit?: number;
  dropdownMinWidth?: string;
  dropdownMaxWidth?: string;
  listMaxHeightClass?: string;
  wrapOptions?: boolean;
  searchPlaceholder?: string;
  noMatchesText?: string;
  refineSearchText?: (totalMatches: number) => string;
}

const DEFAULT_MAX_RESULTS = 80;
const DEFAULT_DEBOUNCE_MS = 80;
const DEFAULT_EMPTY_QUERY_LIMIT = 40;

function scoreIndexedOption(option: IndexedOption, query: string, queryNorm: string): number {
  const blobLower = option.searchBlob.toLowerCase();
  const qLower = query.toLowerCase().trim();

  if (!qLower) return 0;

  if (blobLower.includes(qLower)) {
    return 35000 - blobLower.indexOf(qLower);
  }

  const labelLower = option.label.toLowerCase();
  if (labelLower.startsWith(qLower)) {
    return 32000 - option.label.length;
  }

  const shortName = option.value.split(".").pop() || option.value;
  if (shortName.toLowerCase().startsWith(queryNorm)) {
    return 30000;
  }

  return scoreFuzzyText(option.label, query);
}

function highlightLabel(label: string, query: string) {
  if (!query) return label;

  const lLower = label.toLowerCase();
  const qLower = query.toLowerCase();
  const exactIdx = lLower.indexOf(qLower);
  if (exactIdx !== -1) {
    return (
      <>
        {label.slice(0, exactIdx)}
        <span className="text-[var(--state-info)] font-semibold">{label.slice(exactIdx, exactIdx + query.length)}</span>
        {label.slice(exactIdx + query.length)}
      </>
    );
  }

  const qTokens = qLower.split(/[.\s_/]+/).filter(Boolean);
  if (qTokens.length > 1) {
    const matchRanges: [number, number][] = [];
    let searchFrom = 0;
    for (const qt of qTokens) {
      const idx = lLower.indexOf(qt, searchFrom);
      if (idx !== -1) {
        matchRanges.push([idx, idx + qt.length]);
        searchFrom = idx + qt.length;
      }
    }
    if (matchRanges.length > 0) {
      const matchSet = new Set<number>();
      for (const [start, end] of matchRanges) {
        for (let k = start; k < end; k++) matchSet.add(k);
      }
      return buildHighlightParts(label, matchSet);
    }
  }

  const indices = subsequenceMatchIndices(label, query);
  if (!indices) return label;
  return buildHighlightParts(label, new Set(indices));
}

function buildHighlightParts(label: string, matchSet: Set<number>) {
  const parts: JSX.Element[] = [];
  let i = 0;
  while (i < label.length) {
    if (matchSet.has(i)) {
      let j = i;
      while (j < label.length && matchSet.has(j)) j++;
      parts.push(<span key={i} className="text-[var(--state-info)] font-semibold">{label.slice(i, j)}</span>);
      i = j;
    } else {
      let j = i;
      while (j < label.length && !matchSet.has(j)) j++;
      parts.push(<span key={i}>{label.slice(i, j)}</span>);
      i = j;
    }
  }
  return <>{parts}</>;
}

export function SearchableSelect({
  value,
  options,
  placeholder,
  disabled,
  onChange,
  className,
  maxResults = DEFAULT_MAX_RESULTS,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  emptyQueryLimit = DEFAULT_EMPTY_QUERY_LIMIT,
  dropdownMinWidth,
  dropdownMaxWidth = "480px",
  listMaxHeightClass = "max-h-[160px]",
  wrapOptions = false,
  searchPlaceholder,
  noMatchesText,
  refineSearchText,
}: Props) {
  const { t } = useTranslation();
  const resolvedSearchPlaceholder = searchPlaceholder ?? t("select.searchPlaceholder");
  const resolvedNoMatches = noMatchesText ?? t("select.noMatches");
  const resolvedRefineSearch = refineSearchText ?? ((count: number) => t("select.refineSearch", { count }));
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const isKeyboardNav = useRef(false);

  const indexedOptions = useMemo<IndexedOption[]>(
    () =>
      options.map((o) => ({
        ...o,
        searchBlob: normalizeSearchText(`${o.label} ${o.searchExtra ?? ""} ${o.value}`),
      })),
    [options],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), debounceMs);
    return () => window.clearTimeout(timer);
  }, [query, debounceMs]);

  const { filtered, truncated, totalMatches } = useMemo(() => {
    const q = debouncedQuery.trim();
    const queryNorm = normalizeSearchText(q);

    if (!q) {
      const slice = indexedOptions.slice(0, emptyQueryLimit);
      return {
        filtered: slice,
        truncated: indexedOptions.length > emptyQueryLimit,
        totalMatches: indexedOptions.length,
      };
    }

    const scored = indexedOptions
      .map((option) => ({ option, score: scoreIndexedOption(option, q, queryNorm) }))
      .filter((x) => x.score >= 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (a.option.label.length !== b.option.label.length) {
          return a.option.label.length - b.option.label.length;
        }
        return a.option.label.localeCompare(b.option.label);
      });

    return {
      filtered: scored.slice(0, maxResults).map((x) => x.option),
      truncated: scored.length > maxResults,
      totalMatches: scored.length,
    };
  }, [indexedOptions, debouncedQuery, maxResults, emptyQueryLimit]);

  useEffect(() => {
    setHighlightIndex(0);
  }, [filtered.length, debouncedQuery]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setDebouncedQuery("");
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  useEffect(() => {
    if (!open || !listRef.current || !isKeyboardNav.current) return;
    const el = listRef.current.children[highlightIndex] as HTMLElement;
    if (el) el.scrollIntoView({ block: "nearest" });
    isKeyboardNav.current = false;
  }, [highlightIndex, open]);

  const select = useCallback(
    (val: string) => {
      onChange(val);
      setOpen(false);
    },
    [onChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        isKeyboardNav.current = true;
        setHighlightIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        isKeyboardNav.current = true;
        setHighlightIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filtered[highlightIndex]) select(filtered[highlightIndex].value);
      } else if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    },
    [filtered, highlightIndex, select],
  );

  const selectedOption = options.find((o) => o.value === value);
  const selectedLabel = selectedOption?.label;
  const highlightQuery = debouncedQuery;

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(!open)}
        title={selectedOption?.title ?? selectedOption?.label}
        className={cn(
          "w-full h-8 flex items-center justify-between gap-2 bg-[var(--surface-2)] px-2.5 py-1 rounded-md border border-[var(--line-strong)] text-xs text-left text-[var(--text-normal)]",
          disabled && "opacity-50 cursor-not-allowed",
          !disabled && "hover:border-[var(--focus-ring)]/55",
        )}
      >
        <span className={cn("truncate font-mono", !selectedLabel && "text-[var(--text-muted)]")}>
          {selectedLabel || placeholder || ""}
        </span>
        <ChevronDown size={12} className="shrink-0 text-[var(--text-muted)]" />
      </button>

      {open && (
        <div
          className={cn(
            "absolute z-[60] top-full left-0 mt-1 bg-[var(--surface-0)] border border-[var(--line-soft)] rounded-md shadow-[var(--elevation-2)] flex flex-col overflow-hidden",
            dropdownMinWidth ? "w-max" : "right-0",
          )}
          style={{
            minWidth: dropdownMinWidth ?? undefined,
            maxWidth: dropdownMinWidth ? dropdownMaxWidth : undefined,
          }}
        >
          <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-[var(--line-soft)]">
            <Search size={12} className="shrink-0 text-[var(--text-muted)]" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={resolvedSearchPlaceholder}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-form-type="other"
              data-lpignore="true"
              className="flex-1 bg-transparent text-xs focus:outline-none text-[var(--text-normal)] placeholder:text-[var(--text-muted)]"
            />
          </div>
          <div ref={listRef} className={cn("overflow-y-auto", listMaxHeightClass)}>
            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-xs text-center text-[var(--text-muted)]">
                {resolvedNoMatches}
              </div>
            ) : (
              filtered.map((opt, idx) => (
                <div
                  key={opt.value}
                  title={opt.title ?? opt.label}
                  className={cn(
                    "flex items-start gap-2 px-3 py-2 text-xs cursor-pointer",
                    idx === highlightIndex && "bg-[var(--surface-1)] text-[var(--text-strong)]",
                    idx !== highlightIndex && "hover:bg-[var(--surface-1)] text-[var(--text-normal)]",
                  )}
                  onMouseEnter={() => setHighlightIndex(idx)}
                  onClick={() => select(opt.value)}
                >
                  <span className="w-1.5 pt-1.5 shrink-0 flex justify-center">
                    {opt.value === value && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--state-info)]" />
                    )}
                  </span>
                  <span
                    className={cn(
                      "flex-1 min-w-0 font-mono leading-snug",
                      wrapOptions ? "break-all whitespace-normal" : "truncate",
                    )}
                  >
                    {highlightLabel(opt.label, highlightQuery)}
                  </span>
                  {opt.badge && (
                    <span className="shrink-0 pt-0.5 text-[10px] tabular-nums text-[var(--text-muted)]">
                      {opt.badge}
                    </span>
                  )}
                </div>
              ))
            )}
            {truncated && (
              <div className="px-2 py-1.5 text-[10px] text-center text-[var(--text-muted)] border-t border-[var(--line-soft)]">
                {resolvedRefineSearch(totalMatches)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
