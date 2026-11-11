import { pct, type Async, type PredictResponse } from "../lib/api";
import { featureLabel } from "../lib/features";
import { ErrorState } from "./ErrorState";

interface Props {
  result: Async<PredictResponse>;
  explanation: Async<string>;
  onExplain: () => void;
  onRetry: () => void;
}

const tone = {
  benign: { text: "text-benign", bg: "bg-benign", soft: "bg-benign-soft", word: "Benign pattern" },
  malignant: {
    text: "text-malignant",
    bg: "bg-malignant",
    soft: "bg-malignant-soft",
    word: "Malignant pattern",
  },
};

export function ResultPanel({ result, explanation, onExplain, onRetry }: Props) {
  return (
    <section
      aria-labelledby="result-title"
      className="card overflow-hidden"
      aria-busy={result.state === "loading"}
    >
      <div className="border-b border-line px-5 py-4 sm:px-6">
        <p className="eyebrow">Step 2</p>
        <h2 id="result-title" className="font-display text-2xl font-semibold">
          Result
        </h2>
      </div>
      <div className="px-5 py-5 sm:px-6" aria-live="polite">
        {result.state === "idle" && <EmptyState />}
        {result.state === "loading" && <ResultSkeleton />}
        {result.state === "error" && (
          <ErrorState title="Prediction failed" message={result.message} onRetry={onRetry} />
        )}
        {result.state === "done" && (
          <Verdict data={result.data} explanation={explanation} onExplain={onExplain} />
        )}
      </div>
    </section>
  );
}

function EmptyState() {
  return (
    <div className="py-8 text-center">
      <svg viewBox="0 0 64 64" className="mx-auto size-16" aria-hidden>
        <circle
          cx="32"
          cy="32"
          r="26"
          fill="none"
          stroke="var(--color-line-strong)"
          strokeWidth="3"
          strokeDasharray="4 6"
        />
        <circle
          cx="35"
          cy="29"
          r="8"
          fill="var(--color-malignant-soft)"
          stroke="var(--color-line-strong)"
          strokeWidth="2"
        />
      </svg>
      <p className="mt-4 font-medium">No prediction yet</p>
      <p className="mx-auto mt-1 max-w-xs text-sm text-ink-muted">
        Load the benign or malignant sample, then run the prediction to see every model’s verdict.
      </p>
    </div>
  );
}

function ResultSkeleton() {
  return (
    <div className="space-y-4" aria-label="Loading result">
      <div className="skeleton h-5 w-28" />
      <div className="skeleton h-10 w-3/4" />
      <div className="skeleton h-3 w-full" />
      <div className="space-y-2 pt-2">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="skeleton h-6 w-full" />
        ))}
      </div>
    </div>
  );
}

function Verdict({
  data,
  explanation,
  onExplain,
}: {
  data: PredictResponse;
  explanation: Async<string>;
  onExplain: () => void;
}) {
  const { prediction, comparison, out_of_range } = data;
  const t = tone[prediction.diagnosis];
  const prob = prediction.probability_malignant;
  const agree = comparison?.filter((c) => c.diagnosis === prediction.diagnosis).length ?? 0;

  return (
    <div className="animate-rise">
      <p className="text-sm text-ink-muted">{data.model.name} predicts</p>
      <p className={`mt-1 flex items-center gap-2.5 font-display text-3xl font-semibold ${t.text}`}>
        <span className={`size-3 rounded-full ${t.bg}`} aria-hidden />
        {t.word}
      </p>

      {prob !== null ? (
        <div className="mt-4">
          <div className="flex justify-between text-sm">
            <span className="text-ink-soft">Probability of malignancy</span>
            <span className="font-mono font-medium tabular-nums">{pct(prob)}</span>
          </div>
          <Meter value={prob} />
        </div>
      ) : (
        <p className="mt-3 text-sm text-ink-muted">
          This model gives a class only, not a probability.
        </p>
      )}

      {out_of_range.length > 0 && (
        <div className="mt-4 rounded-md bg-caution-soft p-3 text-sm text-caution" role="note">
          <p className="font-medium">Outside the training range</p>
          <p className="mt-0.5">
            {out_of_range.map(featureLabel).join(", ")}. Predictions for unusual values are less
            reliable.
          </p>
        </div>
      )}

      {comparison && (
        <div className="mt-6">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold">Model agreement</h3>
            <p className="text-sm text-ink-muted tabular-nums">
              {agree} of {comparison.length} agree
            </p>
          </div>
          <ul className="mt-3 space-y-2.5">
            {comparison.map((c) => {
              const ct = tone[c.diagnosis];
              return (
                <li
                  key={c.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1"
                >
                  <span className="truncate text-sm">{c.name}</span>
                  <span className={`text-xs font-medium ${ct.text}`}>
                    {c.diagnosis === "malignant" ? "Malignant" : "Benign"}
                    {c.probability_malignant !== null && (
                      <span className="font-mono tabular-nums">
                        {" "}
                        · {pct(c.probability_malignant, 0)}
                      </span>
                    )}
                  </span>
                  <div className="col-span-2">
                    <Meter value={c.probability_malignant ?? c.label} thin />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="mt-6 border-t border-line pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">Plain-language explanation</h3>
          {explanation.state !== "loading" && (
            <button type="button" className="btn btn-ghost text-sm" onClick={onExplain}>
              {explanation.state === "done" ? "Regenerate" : "Explain this result"}
            </button>
          )}
        </div>
        {explanation.state === "idle" && (
          <p className="mt-2 text-sm text-ink-muted">
            An AI model (Groq) summarises which measurements drove the result.
          </p>
        )}
        {explanation.state === "loading" && (
          <div className="mt-3 space-y-2" aria-label="Writing explanation">
            <div className="skeleton h-3.5 w-full" />
            <div className="skeleton h-3.5 w-11/12" />
            <div className="skeleton h-3.5 w-4/5" />
          </div>
        )}
        {explanation.state === "error" && (
          <p role="alert" className="mt-2 text-sm text-malignant">
            {explanation.message}
          </p>
        )}
        {explanation.state === "done" && (
          <div className="mt-3 space-y-3 text-[0.9375rem] leading-relaxed text-ink-soft">
            {explanation.data
              .split(/\n{2,}/)
              .map((para) => para.trim())
              .filter(Boolean)
              .map((para, i) => (
                <p key={i} className="whitespace-pre-line">
                  {para.replace(/\*\*/g, "")}
                </p>
              ))}
            <p className="text-xs text-ink-muted">AI-generated. It can be wrong.</p>
          </div>
        )}
      </div>

      <p className="mt-5 text-xs text-ink-muted">
        {data.logged
          ? `Logged anonymously as prediction #${data.id}.`
          : "Not logged (history unavailable)."}
      </p>
    </div>
  );
}

function Meter({ value, thin = false }: { value: number; thin?: boolean }) {
  const malignant = value >= 0.5;
  return (
    <div
      className={`relative mt-1.5 w-full overflow-hidden rounded-full bg-sunken ${thin ? "h-1.5" : "h-2.5"}`}
      aria-hidden
    >
      <div
        className={`h-full rounded-full transition-[width] duration-500 ease-out ${malignant ? "bg-malignant" : "bg-benign"}`}
        style={{ width: `${Math.max(value * 100, 2)}%` }}
      />
      <div className="absolute inset-y-0 left-1/2 w-px bg-line-strong" />
    </div>
  );
}
