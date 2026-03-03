import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, Search } from "lucide-react";
import {
  normalizeSearchText,
  scoreFuzzyText,
  subsequenceMatchIndices,
} from "@/lib/fuzzy-search";

interface Option {
  value: string;
  label: string;
  searchExtra?: string;
}

interface Props {
  value: string;
  options: Option[];
  placeholder?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  className?: string;
}

function scoreOption(option: Option, query: string): number {
  const labelScore = scoreFuzzyText(option.label, query);
  const valueScore = scoreFuzzyText(option.value, query);
  const extraScore = option.searchExtra ? scoreFuzzyText(option.searchExtra, query) : -1;
  const all = [labelScore, valueScore, extraScore];
  const best = Math.max(...all);
  if (best < 0) return -1;

  // Label matches should win for user-facing readability.
  let weighted = best;
  if (best === labelScore) weighted += 800;
  if (best === valueScore) weighted += 300;

  const queryNorm = normalizeSearchText(query);
  const shortName = option.value.split(".").pop() || option.value;
  if (shortName.toLowerCase().startsWith(queryNorm)) weighted += 1200;

  return weighted;
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
        <span className="text-[var(--color-primary)] font-semibold">{label.slice(exactIdx, exactIdx + query.length)}</span>
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
      parts.push(<span key={i} className="text-[var(--color-primary)] font-semibold">{label.slice(i, j)}</span>);
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

export function SearchableSelect({ value, options, placeholder, disabled, onChange, className }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const isKeyboardNav = useRef(false);

  const filtered = useMemo(() => {
    if (!query) return options;
    return options
      .map((o) => {
        return { option: o, score: scoreOption(o, query) };
      })
      .filter((x) => x.score >= 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (a.option.label.length !== b.option.label.length) {
          return a.option.label.length - b.option.label.length;
        }
        return a.option.label.localeCompare(b.option.label);
      })
      .map((x) => x.option);
  }, [options, query]);

  useEffect(() => {
    setHighlightIndex(0);
  }, [filtered.length]);

  useEffect(() => {
    if (open) {
      setQuery("");
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
    [onChange]
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
    [filtered, highlightIndex, select]
  );

  const selectedLabel = options.find((o) => o.value === value)?.label;

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(!open)}
        className={cn(
          "w-full flex items-center justify-between gap-1 bg-[var(--color-secondary)] px-2 py-1 rounded border border-[var(--color-input)] text-[11px] font-mono text-left",
          disabled && "opacity-50 cursor-not-allowed",
          !disabled && "hover:border-[var(--color-ring)]"
        )}
      >
        <span className={cn("truncate", !selectedLabel && "text-[var(--color-muted-foreground)]")}>
          {selectedLabel || placeholder || ""}
        </span>
        <ChevronDown size={12} className="shrink-0 text-[var(--color-muted-foreground)]" />
      </button>

      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-[var(--color-popover)] border border-[var(--color-border)] rounded-md shadow-lg flex flex-col overflow-hidden">
          <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-[var(--color-border)]">
            <Search size={12} className="shrink-0 text-[var(--color-muted-foreground)]" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search..."
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-form-type="other"
              data-lpignore="true"
              className="flex-1 bg-transparent text-[11px] focus:outline-none text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)]"
            />
          </div>
          <div ref={listRef} className="max-h-[160px] overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-2 py-3 text-[11px] text-center text-[var(--color-muted-foreground)]">
                No matches
              </div>
            ) : (
              filtered.map((opt, idx) => (
                <div
                  key={opt.value}
                  title={opt.value}
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-mono cursor-pointer",
                    idx === highlightIndex && "bg-[var(--color-accent)]",
                    idx !== highlightIndex && "hover:bg-[var(--color-secondary)]"
                  )}
                  onMouseEnter={() => setHighlightIndex(idx)}
                  onClick={() => select(opt.value)}
                >
                  {opt.value === value && (
                    <span className="w-1 h-1 rounded-full bg-[var(--color-primary)] shrink-0" />
                  )}
                  <span className="truncate">{highlightLabel(opt.label, query)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
