import { useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "@/store/app-store";
import { cn } from "@/lib/utils";
import { X, Plus, Globe } from "lucide-react";

export function TabBar() {
  const { t } = useTranslation();
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
              "flex items-center gap-1.5 px-3 h-9 border-r cursor-pointer text-xs shrink-0 max-w-[200px] group transition-all duration-200 relative",
              tab.id === activeTabId
                ? "bg-[var(--color-background)] text-[var(--color-foreground)]"
                : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-secondary)]",
              dragIndex !== null && dragIndex !== index && "transition-transform",
              dragOverIndex === index && dragIndex !== index && "bg-[var(--color-primary)]/5",
              justDroppedId === tab.id && "bg-[var(--color-primary)]/10"
            )}
            onClick={() => setActiveTab(tab.id)}
            title={tab.tabType === "http" ? tab.httpUrl || tab.title : tab.method ? `${tab.method.serviceName}/${tab.method.methodName}` : tab.title}
          >
            {dragOverIndex === index && dragIndex !== null && dragIndex !== index && (
              <div className="absolute left-0 top-1 bottom-1 w-0.5 bg-[var(--color-primary)] rounded-full" />
            )}
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
        onClick={() => addTab(undefined, "grpc")}
        title={t("tabs.newRequest")}
      >
        <Plus size={14} />
      </button>
      <button
        className="flex items-center justify-center w-9 h-9 hover:bg-[var(--color-secondary)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] border-l"
        onClick={() => addTab(undefined, "http")}
        title={t("http.newRequest")}
      >
        <Globe size={14} />
      </button>
    </div>
  );
}
