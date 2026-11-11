const BASE = (import.meta.env.VITE_API_URL ?? "http://localhost:5108").replace(/\/$/, "");

export type Diagnosis = "benign" | "malignant";
export interface PredictionResult {
  label: 0 | 1;
  diagnosis: Diagnosis;
  probability_malignant: number | null;
}
export interface ModelInfo {
  id: string;
  name: string;
  algorithm: string;
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  roc_auc: number;
  confusion_matrix: { tn: number; fp: number; fn: number; tp: number };
  has_probability: boolean;
}
export interface ModelsResponse {
  default_model: string;
  dataset: string;
  test_size: number;
  models: ModelInfo[];
}
export interface PredictResponse {
  id: number | null;
  logged: boolean;
  model: { id: string; name: string };
  prediction: PredictionResult;
  out_of_range: string[];
  comparison: ({ id: string; name: string } & PredictionResult)[] | null;
  disclaimer: string;
}
export interface ExplainResponse {
  explanation: string;
  prediction: PredictionResult;
}
export interface StatsResponse {
  total: number;
  malignant: number;
  last_24h: number;
  by_model: { model_id: string; count: number }[];
  recent: {
    id: number;
    created_at: string;
    model_id: string;
    label: 0 | 1;
    probability_malignant: number | null;
  }[];
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
  ) {
    super(message);
  }
}

// Render's free tier sleeps; the first request can take 30-60 s. Listeners drive the "waking up" banner.
const SLOW_MS = 4000;
let slow = 0;
const listeners = new Set<(waking: boolean) => void>();
const notify = () => listeners.forEach((l) => l(slow > 0));
export function onWakeChange(listener: (waking: boolean) => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

async function request<T>(path: string, init?: RequestInit, retries = 0): Promise<T> {
  let markedSlow = false;
  const timer = setTimeout(() => {
    markedSlow = true;
    slow++;
    notify();
  }, SLOW_MS);
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await fetch(`${BASE}${path}`, {
          ...init,
          headers: { "Content-Type": "application/json", ...init?.headers },
          signal: AbortSignal.timeout(90_000),
        });
        const body = await res.json().catch(() => null);
        if (res.ok) return body as T;
        // 502/503 while the instance boots: retry idempotent calls.
        if ((res.status === 502 || res.status === 503) && attempt < retries) {
          await new Promise((r) => setTimeout(r, 3000));
          continue;
        }
        const err = body?.error;
        const detail = err?.details?.[0];
        throw new ApiError(
          detail
            ? `${err.message} ${detail.field}: ${detail.message}`
            : (err?.message ?? `Request failed (${res.status})`),
          res.status,
          err?.code ?? "http_error",
        );
      } catch (e) {
        if (e instanceof ApiError) throw e;
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, 3000));
          continue;
        }
        throw new ApiError(
          "Can't reach the server. Check your connection and try again.",
          0,
          "network",
        );
      }
    }
  } finally {
    clearTimeout(timer);
    if (markedSlow) slow--;
    notify();
  }
}

export const api = {
  models: () => request<ModelsResponse>("/api/models", undefined, 3),
  stats: () => request<StatsResponse>("/api/predictions/stats", undefined, 3),
  predict: (model: string, features: number[]) =>
    request<PredictResponse>("/api/predict", {
      method: "POST",
      body: JSON.stringify({ model, features, compare: true }),
    }),
  explain: (model: string, features: number[]) =>
    request<ExplainResponse>("/api/explain", {
      method: "POST",
      body: JSON.stringify({ model, features }),
    }),
};

export const pct = (n: number, digits = 1) => `${(n * 100).toFixed(digits)}%`;
