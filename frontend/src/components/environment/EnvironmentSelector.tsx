import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useEnvStore } from "@/store/env-store";
import { Globe, ChevronDown, Settings } from "lucide-react";

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
        className="flex items-center gap-1 text-xs px-2 py-1 rounded hover:bg-[var(--color-secondary)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-colors"
      >
        <Globe size={13} />
        <span className="max-w-[120px] truncate">
          {activeEnv ? activeEnv.name : t("environment.noEnv")}
        </span>
        <ChevronDown size={11} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-52 bg-[var(--color-popover)] border rounded-md shadow-lg z-50 py-1">
          <button
            onClick={() => { setActive(0); setOpen(false); }}
            className={`w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--color-secondary)] ${!activeEnv ? "text-[var(--color-primary)] font-medium" : "text-[var(--color-foreground)]"}`}
          >
            {t("environment.noEnv")}
          </button>
          {environments.map((env) => (
            <button
              key={env.id}
              onClick={() => { setActive(env.id); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--color-secondary)] ${env.isActive ? "text-[var(--color-primary)] font-medium" : "text-[var(--color-foreground)]"}`}
            >
              {env.name}
              <span className="ml-1 text-[var(--color-muted-foreground)]">
                ({Object.keys(env.variables ?? {}).length} {t("environment.vars")})
              </span>
            </button>
          ))}
          <div className="border-t my-1" />
          <button
            onClick={() => { onManage(); setOpen(false); }}
            className="w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--color-secondary)] text-[var(--color-muted-foreground)] flex items-center gap-1"
          >
            <Settings size={11} /> {t("environment.manage")}
          </button>
        </div>
      )}
    </div>
  );
}
