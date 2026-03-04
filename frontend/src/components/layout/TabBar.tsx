import { useState, useCallback, useRef } from "react";
import { useAppStore } from "@/store/app-store";
import { cn } from "@/lib/utils";
import { X, Plus } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";

export function TabBar() {
  const { tabs, activeTabId, setActiveTab, removeTab, addTab, reorderTabs } = useAppStore();
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [justDroppedId, setJustDroppedId] = useState<string | null>(null);
  const dragCounterRef = useRef(0);

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    setDragIndex(index);
    setJustDroppedId(null);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
    const el = e.currentTarget as HTMLElement;
    el.style.opacity = "0.4";
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    (e.currentTarget as HTMLElement).style.opacity = "1";
    setDragIndex(null);
    setDragOverIndex(null);
    dragCounterRef.current = 0;
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const handleDragEnter = useCallback((index: number) => {
    dragCounterRef.current++;
    setDragOverIndex(index);
  }, []);

  const handleDragLeave = useCallback(() => {
    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) {
      setDragOverIndex(null);
      dragCounterRef.current = 0;
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, toIndex: number) => {
      e.preventDefault();
      const fromIndex = Number(e.dataTransfer.getData("text/plain"));
      if (!isNaN(fromIndex) && fromIndex !== toIndex) {
        const movedTab = tabs[fromIndex];
        reorderTabs(fromIndex, toIndex);
        if (movedTab) {
          setJustDroppedId(movedTab.id);
          setTimeout(() => setJustDroppedId(null), 500);
        }
      }
      setDragIndex(null);
      setDragOverIndex(null);
      dragCounterRef.current = 0;
    },
    [reorderTabs, tabs]
  );

  return (
    <div className="flex items-center h-9 bg-[var(--surface-1)] border-b border-[var(--line-soft)] select-none">
      <div className="flex items-center overflow-x-auto flex-1 min-w-0">
        {tabs.map((tab, index) => (
          <div
            key={tab.id}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragEnd={handleDragEnd}
            onDragOver={handleDragOver}
            onDragEnter={() => handleDragEnter(index)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, index)}
            className={cn(
              "flex items-center gap-1.5 px-3 h-9 border-r border-[var(--line-soft)] cursor-pointer text-xs shrink-0 max-w-[220px] group transition-all duration-150 relative",
              tab.id === activeTabId
                ? "bg-[var(--surface-0)] text-[var(--text-strong)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-normal)] hover:bg-[var(--surface-2)]",
              dragIndex !== null && dragIndex !== index && "transition-transform",
              dragOverIndex === index && dragIndex !== index && "bg-[var(--state-info)]/10",
              justDroppedId === tab.id && "bg-[var(--state-info)]/15"
            )}
            onClick={() => setActiveTab(tab.id)}
            title={tab.method ? `${tab.method.serviceName}/${tab.method.methodName}` : tab.title}
          >
            {dragOverIndex === index && dragIndex !== null && dragIndex !== index && (
              <div className="absolute left-0 top-1 bottom-1 w-0.5 bg-[var(--state-info)] rounded-full" />
            )}
            <span className="truncate">{tab.title}</span>
            <button
              className="opacity-0 group-hover:opacity-100 hover:bg-[var(--surface-1)] rounded p-0.5 transition-opacity"
              onClick={(e) => {
                e.stopPropagation();
                removeTab(tab.id);
              }}
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
      <IconButton
        className="w-9 h-9 rounded-none border-y-0 border-r-0 border-l border-[var(--line-soft)] bg-[var(--surface-1)]"
        onClick={() => addTab()}
      >
        <Plus size={14} />
      </IconButton>
    </div>
  );
}
