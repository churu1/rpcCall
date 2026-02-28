import { Plus, Trash2 } from "lucide-react";

interface VariableConfigProps {
  variables: BenchmarkVariable[];
  onChange: (variables: BenchmarkVariable[]) => void;
}

const VAR_TYPES: { value: BenchmarkVariable["type"]; label: string }[] = [
  { value: "sequence", label: "递增序列" },
  { value: "random_int", label: "随机整数" },
  { value: "random_string", label: "随机字符串" },
  { value: "list", label: "列表随机" },
];

function emptyVariable(): BenchmarkVariable {
  return { name: "", type: "sequence", min: 1, max: 1000, values: [] };
}

export function VariableConfig({ variables, onChange }: VariableConfigProps) {
  const update = (idx: number, patch: Partial<BenchmarkVariable>) => {
    onChange(variables.map((v, i) => (i === idx ? { ...v, ...patch } : v)));
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-[var(--color-muted-foreground)]">
          变量配置 <span className="opacity-60">（在 Body 中用 {"{{varName}}"} 引用）</span>
        </span>
        <button
          onClick={() => onChange([...variables, emptyVariable()])}
          className="flex items-center gap-1 text-[10px] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] px-1.5 py-0.5 rounded hover:bg-[var(--color-secondary)]"
        >
          <Plus size={11} /> 添加
        </button>
      </div>

      {variables.map((v, i) => (
        <div
          key={i}
          className="flex items-start gap-1.5 p-2 rounded bg-[var(--color-secondary)] border border-[var(--color-border)]"
        >
          <div className="flex flex-col gap-1 flex-1 min-w-0">
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={v.name}
                onChange={(e) => update(i, { name: e.target.value })}
                placeholder="变量名"
                className="flex-1 bg-[var(--color-background)] text-xs px-2 py-1 rounded border border-[var(--color-input)] focus:outline-none focus:ring-1 focus:ring-[var(--color-ring)] font-mono"
              />
              <select
                value={v.type}
                onChange={(e) => update(i, { type: e.target.value as BenchmarkVariable["type"] })}
                className="bg-[var(--color-background)] text-xs px-2 py-1 rounded border border-[var(--color-input)] focus:outline-none focus:ring-1 focus:ring-[var(--color-ring)]"
              >
                {VAR_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            {(v.type === "sequence" || v.type === "random_int") && (
              <div className="flex items-center gap-1 text-[10px] text-[var(--color-muted-foreground)]">
                <span>Min:</span>
                <input
                  type="number"
                  value={v.min}
                  onChange={(e) => update(i, { min: Number(e.target.value) })}
                  className="w-20 bg-[var(--color-background)] text-xs px-2 py-0.5 rounded border border-[var(--color-input)] focus:outline-none focus:ring-1 focus:ring-[var(--color-ring)]"
                />
                <span>Max:</span>
                <input
                  type="number"
                  value={v.max}
                  onChange={(e) => update(i, { max: Number(e.target.value) })}
                  className="w-20 bg-[var(--color-background)] text-xs px-2 py-0.5 rounded border border-[var(--color-input)] focus:outline-none focus:ring-1 focus:ring-[var(--color-ring)]"
                />
              </div>
            )}

            {v.type === "random_string" && (
              <div className="flex items-center gap-1 text-[10px] text-[var(--color-muted-foreground)]">
                <span>长度:</span>
                <input
                  type="number"
                  value={v.max || 8}
                  onChange={(e) => update(i, { max: Number(e.target.value) })}
                  className="w-20 bg-[var(--color-background)] text-xs px-2 py-0.5 rounded border border-[var(--color-input)] focus:outline-none focus:ring-1 focus:ring-[var(--color-ring)]"
                />
              </div>
            )}

            {v.type === "list" && (
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] text-[var(--color-muted-foreground)]">
                  候选值（逗号分隔）:
                </span>
                <input
                  type="text"
                  value={v.values.join(", ")}
                  onChange={(e) =>
                    update(i, {
                      values: e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder="value1, value2, value3"
                  className="bg-[var(--color-background)] text-xs px-2 py-0.5 rounded border border-[var(--color-input)] focus:outline-none focus:ring-1 focus:ring-[var(--color-ring)]"
                />
              </div>
            )}
          </div>

          <button
            onClick={() => onChange(variables.filter((_, j) => j !== i))}
            className="p-1 hover:bg-[var(--color-background)] rounded text-[var(--color-muted-foreground)] hover:text-[var(--color-destructive)] shrink-0 mt-0.5"
          >
            <Trash2 size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
