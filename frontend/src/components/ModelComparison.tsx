import { useState } from "react";
import { pct, type Async, type ModelInfo, type ModelsResponse } from "../lib/api";
import { ErrorState } from "./ErrorState";

const METRICS = [
  { key: "accuracy", label: "Accuracy", help: "Share of all test cases classified correctly." },
  { key: "recall", label: "Recall", help: "Share of malignant cases the model caught." },
  { key: "precision", label: "Precision", help: "Share of malignant calls that were correct." },
  { key: "f1", label: "F1", help: "Balance of precision and recall." },
  { key: "roc_auc", label: "ROC AUC", help: "How well scores rank malignant above benign." },
] as const;
type MetricKey = (typeof METRICS)[number]["key"];

export function ModelComparison({
  models,
  onRetry,
}: {
  models: Async<ModelsResponse>;
  onRetry: () => void;
}) {
  const [metric, setMetric] = useState<MetricKey>("accuracy");
  const m = METRICS.find((x) => x.key === metric)!;

  return (
    <section id="models" aria-labelledby="models-title" className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Hold-out evaluation</p>
          <h2 id="models-title" className="font-display text-2xl font-semibold">
            Model comparison
          </h2>
          <p className="mt-1 max-w-prose text-sm text-ink-muted">
            {models.state === "done"
              ? `Scored on the same ${models.data.test_size} unseen cases from the ${models.data.dataset}.`
              : "Scored on the same unseen test cases."}
          </p>
        </div>
        <div
          role="radiogroup"
          aria-label="Metric"
          className="flex flex-wrap gap-1 rounded-md bg-sunken p-1"
        >
          {METRICS.map((x) => (
            <button
              key={x.key}
              type="button"
              role="radio"
              aria-checked={metric === x.key}
              onClick={() => setMetric(x.key)}
              className={`min-h-10 rounded-sm px-3 text-sm font-medium transition-[background-color,color] duration-150 ${
                metric === x.key
                  ? "bg-surface text-ink shadow-[var(--shadow-card)]"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              {x.label}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-4 text-sm text-ink-soft">{m.help}</p>

      <div className="mt-4">
        {models.state === "loading" || models.state === "idle" ? (
          <div className="space-y-3" aria-label="Loading model metrics">
            {Array.from({ length: 7 }, (_, i) => (
              <div key={i} className="skeleton h-7 w-full" />
            ))}
          </div>
        ) : models.state === "error" ? (
          <ErrorState
            title="Couldn’t load model metrics"
            message={models.message}
            onRetry={onRetry}
          />
        ) : (
          <Bars models={models.data.models} metric={metric} />
        )}
      </div>
    </section>
  );
}

function Bars({ models, metric }: { models: ModelInfo[]; metric: MetricKey }) {
  const sorted = [...models].sort((a, b) => b[metric] - a[metric]);
  // Zoom the axis: every model scores 85%+, so a 0-100 axis would hide the differences.
  const floor = 0.8;
  return (
    <figure>
      <ul className="space-y-3">
        {sorted.map((model, i) => {
          const v = model[metric];
          const w = Math.max(((v - floor) / (1 - floor)) * 100, 1.5);
          return (
            <li
              key={model.id}
              className="grid grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)_3.5rem] items-center gap-3 sm:grid-cols-[12rem_minmax(0,1fr)_4rem]"
            >
              <span className="truncate text-sm">{model.name}</span>
              <div className="h-6 rounded-sm bg-sunken" aria-hidden>
                <div
                  className={`h-full rounded-sm transition-[width] duration-500 ease-out ${i === 0 ? "bg-brand" : "bg-[#8fa9a6]"}`}
                  style={{ width: `${w}%` }}
                />
              </div>
              <span className="text-right font-mono text-sm tabular-nums">{pct(v)}</span>
            </li>
          );
        })}
      </ul>
      <figcaption className="mt-3 text-xs text-ink-muted">
        Axis starts at 80%. Recall matters most here: a missed malignant case costs more than a
        false alarm.
      </figcaption>
    </figure>
  );
}
