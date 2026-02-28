import { useState, useCallback, useRef } from "react";
import { useAppStore } from "@/store/app-store";
import { cn } from "@/lib/utils";
import { X, Plus } from "lucide-react";

export function TabBar() {
  const { tabs, activeTabId, setActiveTab, removeTab, addTab, reorderTabs } = useAppStore();
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragCounterRef = useRef(0);

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
    const el = e.currentTarget as HTMLElement;
    el.style.opacity = "0.5";
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
        reorderTabs(fromIndex, toIndex);
      }
      setDragIndex(null);
      setDragOverIndex(null);
      dragCounterRef.current = 0;
    },
    [reorderTabs]
  );

  return (
    <div className="flex items-center h-9 bg-[var(--color-card)] border-b select-none">
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
              "flex items-center gap-1.5 px-3 h-9 border-r cursor-pointer text-xs shrink-0 max-w-[200px] group transition-all",
              tab.id === activeTabId
                ? "bg-[var(--color-background)] text-[var(--color-foreground)]"
                : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-secondary)]",
              dragOverIndex === index && dragIndex !== index && "border-l-2 border-l-[var(--color-primary)]"
            )}
            onClick={() => setActiveTab(tab.id)}
            title={tab.method ? `${tab.method.serviceName}/${tab.method.methodName}` : tab.title}
          >
            <span className="truncate">{tab.title}</span>
            <button
              className="opacity-0 group-hover:opacity-100 hover:bg-[var(--color-muted)] rounded p-0.5 transition-opacity"
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
      <button
        className="flex items-center justify-center w-9 h-9 hover:bg-[var(--color-secondary)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
        onClick={() => addTab()}
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
