import { useState, useEffect, useRef, useCallback } from "react";
import { X, ChevronUp, ChevronDown } from "lucide-react";

interface SearchBarProps {
  visible: boolean;
  onClose: () => void;
  text: string;
  onHighlight: (matches: SearchMatch[], currentIndex: number) => void;
  /** For textarea: scroll to match by setting selection */
  onScrollTo?: (match: SearchMatch) => void;
}

export interface SearchMatch {
  start: number;
  end: number;
}

export function SearchBar({ visible, onClose, text, onHighlight, onScrollTo }: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const search = useCallback(
    (q: string, navigate = false) => {
      if (!q.trim()) {
        setMatches([]);
        setCurrentIndex(0);
        onHighlight([], -1);
        return;
      }
      const lowerText = text.toLowerCase();
      const lowerQuery = q.toLowerCase();
      const found: SearchMatch[] = [];
      let pos = 0;
      while (pos < lowerText.length) {
        const idx = lowerText.indexOf(lowerQuery, pos);
        if (idx === -1) break;
        found.push({ start: idx, end: idx + lowerQuery.length });
        pos = idx + 1;
      }
      setMatches(found);
      const newIdx = found.length > 0 ? 0 : -1;
      setCurrentIndex(Math.max(newIdx, 0));
      onHighlight(found, newIdx);
      if (navigate && found.length > 0 && onScrollTo) {
        onScrollTo(found[0]);
      }
    },
    [text, onHighlight, onScrollTo]
  );

  useEffect(() => {
    if (visible) {
      navigatedRef.current = false;
      setTimeout(() => inputRef.current?.focus(), 20);
    } else {
      setQuery("");
      setMatches([]);
      setCurrentIndex(0);
      navigatedRef.current = false;
      onHighlight([], -1);
    }
  }, [visible]);

  useEffect(() => {
    search(query);
  }, [text]);

  const goNext = useCallback(() => {
    if (matches.length === 0) return;
    const next = (currentIndex + 1) % matches.length;
    setCurrentIndex(next);
    onHighlight(matches, next);
    if (onScrollTo) onScrollTo(matches[next]);
  }, [matches, currentIndex, onHighlight, onScrollTo]);

  const goPrev = useCallback(() => {
    if (matches.length === 0) return;
    const prev = (currentIndex - 1 + matches.length) % matches.length;
    setCurrentIndex(prev);
    onHighlight(matches, prev);
    if (onScrollTo) onScrollTo(matches[prev]);
  }, [matches, currentIndex, onHighlight, onScrollTo]);

  const navigatedRef = useRef(false);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (!navigatedRef.current && matches.length > 0) {
          navigatedRef.current = true;
          onHighlight(matches, currentIndex);
          if (onScrollTo) onScrollTo(matches[currentIndex]);
        } else if (e.shiftKey) {
          goPrev();
        } else {
          goNext();
        }
      }
    },
    [onClose, goNext, goPrev, matches, currentIndex, onHighlight, onScrollTo]
  );

  if (!visible) return null;

  return (
    <div className="flex items-center gap-1.5 px-2 py-1.5 bg-[var(--color-card)] border-b border-[var(--color-border)] shrink-0">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          navigatedRef.current = false;
          search(e.target.value);
        }}
        onKeyDown={handleKeyDown}
        placeholder="Search..."
        className="flex-1 bg-[var(--color-secondary)] text-xs px-2 py-1 rounded border border-[var(--color-input)] focus:outline-none focus:ring-1 focus:ring-[var(--color-ring)] text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)] min-w-0"
      />
      <span className="text-[10px] text-[var(--color-muted-foreground)] shrink-0 w-[48px] text-center tabular-nums">
        {matches.length > 0 ? `${currentIndex + 1}/${matches.length}` : query ? "0/0" : ""}
      </span>
      <button
        onClick={() => { navigatedRef.current = true; goPrev(); inputRef.current?.focus(); }}
        disabled={matches.length === 0}
        className="p-0.5 rounded hover:bg-[var(--color-secondary)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] disabled:opacity-30"
        title="Previous (Shift+Enter)"
      >
        <ChevronUp size={14} />
      </button>
      <button
        onClick={() => { navigatedRef.current = true; goNext(); inputRef.current?.focus(); }}
        disabled={matches.length === 0}
        className="p-0.5 rounded hover:bg-[var(--color-secondary)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] disabled:opacity-30"
        title="Next (Enter)"
      >
        <ChevronDown size={14} />
      </button>
      <button
        onClick={onClose}
        className="p-0.5 rounded hover:bg-[var(--color-secondary)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
        title="Close (Esc)"
      >
        <X size={14} />
      </button>
    </div>
  );
}

/** Render text with highlighted search matches */
export function HighlightedText({
  text,
  matches,
  currentIndex,
}: {
  text: string;
  matches: SearchMatch[];
  currentIndex: number;
}) {
  if (matches.length === 0) return <>{text}</>;

  const segments: React.ReactNode[] = [];
  let lastEnd = 0;

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    if (m.start > lastEnd) {
      segments.push(text.slice(lastEnd, m.start));
    }
    const isCurrent = i === currentIndex;
    segments.push(
      <mark
        key={i}
        className={
          isCurrent
            ? "bg-orange-400/80 text-[var(--color-foreground)] rounded-sm px-[1px]"
            : "bg-yellow-300/40 text-[var(--color-foreground)] rounded-sm px-[1px]"
        }
        {...(isCurrent ? { "data-current-match": "true" } : {})}
      >
        {text.slice(m.start, m.end)}
      </mark>
    );
    lastEnd = m.end;
  }
  if (lastEnd < text.length) {
    segments.push(text.slice(lastEnd));
  }
  return <>{segments}</>;
}
