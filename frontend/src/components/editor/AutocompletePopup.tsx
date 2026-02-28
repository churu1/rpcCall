import { useState, useEffect, useRef, useCallback } from "react";

interface Props {
  fields: FieldInfo[];
  onSelect: (field: FieldInfo) => void;
  position: { top: number; left: number };
  visible: boolean;
  onClose: () => void;
  filter: string;
}

export function AutocompletePopup({ fields, onSelect, position, visible, onClose, filter }: Props) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const filtered = fields.filter((f) =>
    f.name.toLowerCase().includes(filter.toLowerCase())
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [filter]);

  useEffect(() => {
    if (!visible) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [visible, onClose]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!visible) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((i) => (i + 1) % Math.max(filtered.length, 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((i) => (i - 1 + Math.max(filtered.length, 1)) % Math.max(filtered.length, 1));
      } else if (e.key === "Enter" || e.key === "Tab") {
        if (filtered.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          onSelect(filtered[selectedIndex]);
        }
      }
    },
    [visible, filtered, selectedIndex, onSelect, onClose]
  );

  useEffect(() => {
    if (!visible) return;
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [visible, handleKeyDown]);

  if (!visible || filtered.length === 0) return null;

  return (
    <div
      ref={ref}
      className="fixed z-[100] bg-[var(--color-popover)] border border-[var(--color-border)] rounded-md shadow-lg max-h-[200px] overflow-y-auto min-w-[200px]"
      style={{ top: position.top, left: position.left }}
    >
      {filtered.map((field, i) => (
        <div
          key={field.name}
          className={`flex items-center justify-between gap-3 px-3 py-1.5 text-xs cursor-pointer ${
            i === selectedIndex
              ? "bg-[var(--color-primary)]/15 text-[var(--color-foreground)]"
              : "text-[var(--color-foreground)] hover:bg-[var(--color-secondary)]"
          }`}
          onClick={() => onSelect(field)}
          onMouseEnter={() => setSelectedIndex(i)}
        >
          <span className="font-mono">
            {field.name}
            {field.repeated && !field.mapEntry && <span className="text-[var(--color-muted-foreground)]">[]</span>}
            {field.mapEntry && <span className="text-[var(--color-muted-foreground)]">{"{}"}</span>}
          </span>
          <span className="text-[10px] text-[var(--color-muted-foreground)] font-mono">{field.typeName}</span>
        </div>
      ))}
    </div>
  );
}
