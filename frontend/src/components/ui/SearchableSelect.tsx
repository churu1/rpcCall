import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, Search } from "lucide-react";

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

function fuzzyMatch(text: string, query: string): number[] | null {
  const tLower = text.toLowerCase();
  const qLower = query.toLowerCase();
  const indices: number[] = [];
  let qi = 0;
  for (let ti = 0; ti < tLower.length && qi < qLower.length; ti++) {
    if (tLower[ti] === qLower[qi]) {
      indices.push(ti);
      qi++;
    }
  }
  return qi === qLower.length ? indices : null;
}

function computeScore(text: string, query: string): number {
  const tLower = text.toLowerCase();
  const qLower = query.toLowerCase();

  if (tLower.indexOf(qLower) !== -1) {
    return 10000 - tLower.indexOf(qLower);
  }

  const qTokens = qLower.split(/[.\s_/]+/).filter(Boolean);
  const tTokens = tLower.split(/[.\s_/]+/).filter(Boolean);

  if (qTokens.length > 1) {
    let matched = 0;
    let tIdx = 0;
    for (const qt of qTokens) {
      while (tIdx < tTokens.length) {
        if (tTokens[tIdx].startsWith(qt) || tTokens[tIdx].includes(qt)) {
          matched++;
          tIdx++;
          break;
        }
        tIdx++;
      }
    }
    if (matched === qTokens.length) {
      return 5000 + matched * 100;
    }
    if (matched > 0) {
      return 1000 + matched * 100;
    }
  }

  const indices = fuzzyMatch(text, query);
  if (!indices) return -1;

  let consecutive = 0;
  for (let i = 1; i < indices.length; i++) {
    if (indices[i] === indices[i - 1] + 1) consecutive++;
  }
  return 100 + consecutive * 10 - indices[indices.length - 1] + indices.length;
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

  const indices = fuzzyMatch(label, query);
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
        const scores = [
          computeScore(o.label, query),
          computeScore(o.value, query),
          o.searchExtra ? computeScore(o.searchExtra, query) : -1,
        ];
        const best = Math.max(...scores);
        return { option: o, score: best };
      })
      .filter((x) => x.score >= 0)
      .sort((a, b) => b.score - a.score)
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
