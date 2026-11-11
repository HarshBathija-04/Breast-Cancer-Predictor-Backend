import { useCallback, useEffect, useState } from "react";
import { toast, Toaster } from "sonner";
import { ModelComparison } from "./components/ModelComparison";
import { PredictForm } from "./components/PredictForm";
import { PredictionLog } from "./components/PredictionLog";
import { ResultPanel, type Async } from "./components/ResultPanel";
import {
  api,
  ApiError,
  onWakeChange,
  pct,
  type ModelsResponse,
  type PredictResponse,
  type StatsResponse,
} from "./lib/api";
import { emptyValues, parseValues, PRESETS, type FeatureValues } from "./lib/features";

const message = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong.");
const REPO_URL = "https://github.com/HarshBathija-04/Breast-Cancer-Predictor-Backend";

export default function App() {
  const [models, setModels] = useState<Async<ModelsResponse>>({ state: "loading" });
  const [stats, setStats] = useState<Async<StatsResponse>>({ state: "loading" });
  const [values, setValues] = useState<FeatureValues>(() => ({ ...PRESETS.benign }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [model, setModel] = useState("random_forest_tuned");
  const [result, setResult] = useState<Async<PredictResponse>>({ state: "idle" });
  const [explanation, setExplanation] = useState<Async<string>>({ state: "idle" });
  const [waking, setWaking] = useState(false);
  const [lastInput, setLastInput] = useState<{ model: string; numbers: number[] } | null>(null);

  useEffect(() => onWakeChange(setWaking), []);

  // Initial state is already "loading", so these only set state from async callbacks.
  const loadModels = useCallback(() => {
    api.models().then(
      (data) => setModels({ state: "done", data }),
      (e) => setModels({ state: "error", message: message(e) }),
    );
  }, []);
  const loadStats = useCallback(() => {
    api.stats().then(
      (data) => setStats({ state: "done", data }),
      (e) => setStats({ state: "error", message: message(e) }),
    );
  }, []);
  useEffect(() => {
    loadModels();
    loadStats();
  }, [loadModels, loadStats]);

  const run = async (input: { model: string; numbers: number[] }) => {
    setLastInput(input);
    setResult({ state: "loading" });
    setExplanation({ state: "idle" });
    try {
      const data = await api.predict(input.model, input.numbers);
      setResult({ state: "done", data });
      const p = data.prediction;
      toast.success(
        `${p.diagnosis === "malignant" ? "Malignant" : "Benign"} pattern` +
          (p.probability_malignant !== null
            ? ` · ${pct(p.probability_malignant, 0)} malignancy`
            : ""),
        { description: data.model.name },
      );
      if (data.logged) loadStats();
      if (window.matchMedia("(max-width: 1023px)").matches) {
        document.getElementById("result")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    } catch (e) {
      setResult({ state: "error", message: message(e) });
      toast.error("Prediction failed", { description: message(e) });
    }
  };

  const submit = () => {
    const parsed = parseValues(values);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      toast.error(`${Object.keys(parsed.errors).length} measurements need attention`);
      return;
    }
    setErrors({});
    run({ model, numbers: parsed.numbers });
  };

  const explain = async () => {
    if (!lastInput) return;
    setExplanation({ state: "loading" });
    try {
      const data = await api.explain(lastInput.model, lastInput.numbers);
      setExplanation({ state: "done", data: data.explanation });
    } catch (e) {
      setExplanation({ state: "error", message: message(e) });
      toast.error("Explanation unavailable", { description: message(e) });
    }
  };

  const best = models.state === "done" ? models.data.models[0] : null;

  return (
    <>
      <a
        href="#predict"
        className="sr-only z-50 rounded-[var(--radius-md)] bg-brand px-4 py-2 text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to the predictor
      </a>
      <Toaster position="bottom-right" richColors closeButton />

      <header className="border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <a href="#top" className="flex items-center gap-2.5 font-display text-lg font-semibold">
            <img src="/favicon.svg" alt="" className="size-8" width={32} height={32} />
            <span>Breast Cancer Predictor</span>
          </a>
          <nav aria-label="Sections" className="hidden items-center gap-1 text-sm sm:flex">
            <a
              className="rounded-[6px] px-3 py-2 text-ink-soft hover:bg-sunken hover:text-ink"
              href="#predict"
            >
              Predict
            </a>
            <a
              className="rounded-[6px] px-3 py-2 text-ink-soft hover:bg-sunken hover:text-ink"
              href="#models"
            >
              Models
            </a>
            <a
              className="rounded-[6px] px-3 py-2 text-ink-soft hover:bg-sunken hover:text-ink"
              href="#log"
            >
              Log
            </a>
            <a
              className="rounded-[6px] px-3 py-2 text-ink-soft hover:bg-sunken hover:text-ink"
              href={REPO_URL}
            >
              GitHub
            </a>
          </nav>
        </div>
      </header>

      <div
        role="note"
        aria-label="Medical disclaimer"
        className="border-b border-[#ecd9ad] bg-caution-soft"
      >
        <div className="mx-auto flex max-w-6xl gap-3 px-4 py-3 text-sm text-caution sm:px-6">
          <svg
            viewBox="0 0 20 20"
            className="mt-0.5 size-5 shrink-0"
            fill="currentColor"
            aria-hidden
          >
            <path d="M10 2a1 1 0 0 1 .87.5l7 12A1 1 0 0 1 17 16H3a1 1 0 0 1-.87-1.5l7-12A1 1 0 0 1 10 2Zm0 5a1 1 0 0 0-1 1v3a1 1 0 1 0 2 0V8a1 1 0 0 0-1-1Zm0 6.25a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z" />
          </svg>
          <p>
            <strong className="font-semibold">Not a medical device.</strong> This is an educational
            machine-learning demo. It cannot diagnose cancer. If you have symptoms or concerns, talk
            to a doctor.
          </p>
        </div>
      </div>

      {waking && (
        <div
          role="status"
          className="fixed inset-x-0 top-3 z-40 mx-auto w-fit max-w-[calc(100%-2rem)] animate-rise rounded-full border border-line bg-surface px-4 py-2 text-sm shadow-[var(--shadow-pop)]"
        >
          <span
            className="mr-2 inline-block size-2 animate-pulse rounded-full bg-caution"
            aria-hidden
          />
          Waking up the server. The free tier sleeps when idle, so this can take up to a minute.
        </div>
      )}

      <main id="top">
        <section className="mx-auto max-w-6xl px-4 pt-10 pb-8 sm:px-6 sm:pt-14">
          <p className="eyebrow">Wisconsin Diagnostic Breast Cancer dataset</p>
          <h1 className="mt-3 max-w-3xl font-display text-4xl leading-[1.1] font-semibold sm:text-5xl">
            Seven trained models. One clear read of the cell measurements.
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-ink-soft">
            Enter the 30 nucleus measurements from a fine-needle aspirate, see whether each
            classifier finds a benign or malignant pattern, and get a plain-language explanation.
          </p>
          <dl className="mt-8 grid max-w-2xl grid-cols-3 gap-px overflow-hidden rounded-[var(--radius-md)] border border-line bg-line">
            {[
              { k: "Best accuracy", v: best ? pct(best.accuracy) : null },
              { k: "Malignant recall", v: best ? pct(best.recall, 0) : null },
              {
                k: "Models",
                v: models.state === "done" ? String(models.data.models.length) : null,
              },
            ].map((s) => (
              <div key={s.k} className="bg-surface px-3 py-3 sm:px-4">
                <dt className="text-xs text-ink-muted">{s.k}</dt>
                <dd className="mt-1 font-mono text-xl font-medium tabular-nums sm:text-2xl">
                  {s.v ?? (
                    <span
                      className="skeleton inline-block h-6 w-14 align-middle"
                      aria-label="Loading"
                    />
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section
          id="predict"
          aria-label="Predictor"
          className="mx-auto max-w-6xl scroll-mt-4 px-4 sm:px-6"
        >
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
            <PredictForm
              values={values}
              errors={errors}
              models={models.state === "done" ? models.data.models : null}
              model={model}
              busy={result.state === "loading"}
              onChange={(name, v) => {
                setValues((s) => ({ ...s, [name]: v }));
                if (errors[name])
                  setErrors((s) => {
                    const next = { ...s };
                    delete next[name];
                    return next;
                  });
              }}
              onModel={setModel}
              onPreset={(kind) => {
                setValues({ ...PRESETS[kind] });
                setErrors({});
                toast(`Loaded a real ${kind} sample from the dataset`);
              }}
              onClear={() => {
                setValues(emptyValues());
                setErrors({});
              }}
              onSubmit={submit}
            />
            <div id="result" className="scroll-mt-4 lg:sticky lg:top-6">
              <ResultPanel
                result={result}
                explanation={explanation}
                onExplain={explain}
                onRetry={() => lastInput && run(lastInput)}
              />
            </div>
          </div>
        </section>

        <div className="mx-auto mt-6 grid max-w-6xl grid-cols-1 gap-6 px-4 pb-16 sm:px-6 lg:grid-cols-2">
          <ModelComparison
            models={models}
            onRetry={() => {
              setModels({ state: "loading" });
              loadModels();
            }}
          />
          <PredictionLog
            stats={stats}
            models={models}
            onRetry={() => {
              setStats({ state: "loading" });
              loadStats();
            }}
          />
        </div>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-ink-muted sm:flex-row sm:justify-between sm:px-6">
          <p>
            Data: Wisconsin Diagnostic Breast Cancer (UCI). For education only, not for clinical
            use.
          </p>
          <a className="underline-offset-4 hover:text-ink hover:underline" href={REPO_URL}>
            Source on GitHub
          </a>
        </div>
      </footer>
    </>
  );
}
