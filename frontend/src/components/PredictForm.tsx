import { useState } from "react";
import { BASES, GROUPS, type FeatureValues } from "../lib/features";
import type { ModelInfo } from "../lib/api";

interface Props {
  values: FeatureValues;
  errors: Record<string, string>;
  models: ModelInfo[] | null;
  model: string;
  busy: boolean;
  onChange: (name: string, value: string) => void;
  onModel: (id: string) => void;
  onPreset: (kind: "benign" | "malignant") => void;
  onClear: () => void;
  onSubmit: () => void;
}

// Shown until /api/models answers (cold start) so the form is usable immediately.
const FALLBACK_MODELS: Pick<ModelInfo, "id" | "name" | "accuracy">[] = [
  { id: "random_forest_tuned", name: "Random Forest (tuned)", accuracy: 0.9825 },
];

export function PredictForm(p: Props) {
  const [tab, setTab] = useState<(typeof GROUPS)[number]["stat"]>("mean");
  const errorCount = (stat: string) => BASES.filter((b) => p.errors[`${b.key}_${stat}`]).length;

  return (
    <form
      className="card p-5 sm:p-6"
      noValidate
      aria-labelledby="form-title"
      onSubmit={(e) => {
        e.preventDefault();
        p.onSubmit();
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Step 1</p>
          <h2 id="form-title" className="font-display text-2xl font-semibold">
            Cell-nucleus measurements
          </h2>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Load sample data">
          <button
            type="button"
            className="btn btn-ghost text-sm"
            onClick={() => p.onPreset("benign")}
          >
            <span className="size-2 rounded-full bg-benign" aria-hidden /> Benign sample
          </button>
          <button
            type="button"
            className="btn btn-ghost text-sm"
            onClick={() => p.onPreset("malignant")}
          >
            <span className="size-2 rounded-full bg-malignant" aria-hidden /> Malignant sample
          </button>
          <button
            type="button"
            className="btn text-sm text-ink-soft hover:bg-sunken"
            onClick={p.onClear}
          >
            Clear
          </button>
        </div>
      </div>
      <p className="mt-2 text-sm text-ink-muted">
        Thirty values computed from a digitised fine-needle aspirate image. Load a real sample from
        the dataset, or enter your own.
      </p>

      <div className="mt-5">
        <label htmlFor="model" className="text-sm font-medium">
          Model
        </label>
        <select
          id="model"
          value={p.model}
          onChange={(e) => p.onModel(e.target.value)}
          className="mt-1.5 block h-11 w-full cursor-pointer rounded-md border border-field bg-surface px-3 text-[0.9375rem] transition-colors duration-150 hover:border-ink-muted"
        >
          {(p.models ?? FALLBACK_MODELS).map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} · {(m.accuracy * 100).toFixed(1)}%
            </option>
          ))}
        </select>
      </div>

      <div
        role="tablist"
        aria-label="Measurement group"
        className="mt-5 grid grid-cols-3 gap-1 rounded-md bg-sunken p-1"
        onKeyDown={(e) => {
          // ARIA tabs pattern: arrow keys move between tabs.
          const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
          if (!step) return;
          e.preventDefault();
          const i = GROUPS.findIndex((g) => g.stat === tab);
          const next = GROUPS[(i + step + GROUPS.length) % GROUPS.length].stat;
          setTab(next);
          document.getElementById(`tab-${next}`)?.focus();
        }}
      >
        {GROUPS.map((g) => {
          const selected = g.stat === tab;
          const errs = errorCount(g.stat);
          return (
            <button
              key={g.stat}
              type="button"
              role="tab"
              id={`tab-${g.stat}`}
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              aria-controls={`panel-${g.stat}`}
              onClick={() => setTab(g.stat)}
              className={`relative min-h-10 rounded-sm px-2 text-sm font-medium transition-[background-color,color,box-shadow] duration-150 ${
                selected
                  ? "bg-surface text-ink shadow-[var(--shadow-card)]"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              {g.label}
              {errs > 0 && (
                <span className="ml-1.5 rounded-full bg-malignant px-1.5 text-xs text-white">
                  {errs}
                  <span className="sr-only"> fields need attention</span>
                </span>
              )}
            </button>
          );
        })}
      </div>

      {GROUPS.map((g) => (
        <div
          key={g.stat}
          role="tabpanel"
          id={`panel-${g.stat}`}
          aria-labelledby={`tab-${g.stat}`}
          hidden={g.stat !== tab}
          className="mt-4"
        >
          <p className="text-sm text-ink-muted">{g.description}.</p>
          <div className="mt-3 grid grid-cols-1 gap-x-4 gap-y-3 min-[480px]:grid-cols-2">
            {BASES.map((b) => {
              const name = `${b.key}_${g.stat}`;
              const id = `f-${name.replace(/\s/g, "-")}`;
              const err = p.errors[name];
              return (
                <div key={name}>
                  <label htmlFor={id} className="text-sm font-medium">
                    {b.label}
                  </label>
                  <input
                    id={id}
                    name={name}
                    inputMode="decimal"
                    type="number"
                    step="any"
                    min={0}
                    value={p.values[name]}
                    onChange={(e) => p.onChange(name, e.target.value)}
                    aria-invalid={!!err}
                    aria-describedby={err ? `${id}-err` : `${id}-hint`}
                    className={`mt-1 block h-11 w-full rounded-md border bg-surface px-3 font-mono text-[0.9375rem] tabular-nums transition-[border-color,box-shadow] duration-150 ${
                      err ? "border-malignant" : "border-field hover:border-ink-muted"
                    }`}
                  />
                  {err ? (
                    <p id={`${id}-err`} className="mt-1 text-xs font-medium text-malignant">
                      {err}
                    </p>
                  ) : (
                    <p id={`${id}-hint`} className="mt-1 text-xs text-ink-muted">
                      {b.hint}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div className="mt-6 flex flex-col-reverse items-stretch gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-ink-muted">
          Runs the selected model, plus the other six for comparison.
        </p>
        <button type="submit" className="btn btn-primary sm:min-w-44" disabled={p.busy}>
          {p.busy && (
            <span
              className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
              aria-hidden
            />
          )}
          {p.busy ? "Running models…" : "Run prediction"}
        </button>
      </div>
    </form>
  );
}
