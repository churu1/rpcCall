import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useEnvStore } from "@/store/env-store";
import { Globe, ChevronDown, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  onManage: () => void;
}

export function EnvironmentSelector({ onManage }: Props) {
  const { t } = useTranslation();
  const { environments, activeEnv, setActive, loadEnvironments } = useEnvStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadEnvironments();
  }, [loadEnvironments]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "h-7 min-w-[96px] max-w-[140px] px-2 rounded-md border border-[var(--line-soft)] bg-[var(--surface-0)]",
          "inline-flex items-center gap-1.5 text-[11px] text-[var(--text-muted)] whitespace-nowrap transition-colors",
          "hover:bg-[var(--surface-1)] hover:text-[var(--text-normal)]"
        )}
      >
        <Globe size={12} className="shrink-0" />
        <span className="min-w-0 flex-1 truncate text-left leading-none">
          {activeEnv ? activeEnv.name : t("environment.noEnv")}
        </span>
        <ChevronDown size={11} className={cn("shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-52 bg-[var(--surface-0)] border border-[var(--line-soft)] rounded-md shadow-[var(--elevation-2)] z-50 py-1">
          <button
            onClick={() => { setActive(0); setOpen(false); }}
            className={`w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--surface-2)] ${!activeEnv ? "text-[var(--state-info)] font-medium" : "text-[var(--text-normal)]"}`}
          >
            {t("environment.noEnv")}
          </button>
          {environments.map((env) => (
            <button
              key={env.id}
              onClick={() => { setActive(env.id); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--surface-2)] ${env.isActive ? "text-[var(--state-info)] font-medium" : "text-[var(--text-normal)]"}`}
            >
              {env.name}
              <span className="ml-1 text-[var(--text-muted)]">
                ({Object.keys(env.variables ?? {}).length} {t("environment.vars")})
              </span>
            </button>
          ))}
          <div className="border-t border-[var(--line-soft)] my-1" />
          <button
            onClick={() => { onManage(); setOpen(false); }}
            className="w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--surface-2)] text-[var(--text-muted)] flex items-center gap-1"
          >
            <Settings size={11} /> {t("environment.manage")}
          </button>
        </div>
      )}
    </div>
  );
}
