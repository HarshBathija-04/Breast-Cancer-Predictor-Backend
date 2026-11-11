import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { FEATURES, parseValues, PRESETS } from "./lib/features";

const models = {
  default_model: "random_forest_tuned",
  dataset: "WDBC",
  test_size: 114,
  models: [
    {
      id: "random_forest_tuned",
      name: "Random Forest (tuned)",
      algorithm: "RandomForestClassifier",
      accuracy: 0.9825,
      precision: 0.95,
      recall: 1,
      f1: 0.975,
      roc_auc: 0.997,
      confusion_matrix: { tn: 73, fp: 2, fn: 0, tp: 39 },
      has_probability: true,
    },
  ],
};
const prediction = {
  id: 7,
  logged: true,
  model: { id: "random_forest_tuned", name: "Random Forest (tuned)" },
  prediction: { label: 1, diagnosis: "malignant", probability_malignant: 0.96 },
  out_of_range: [],
  comparison: [
    {
      id: "random_forest_tuned",
      name: "Random Forest (tuned)",
      label: 1,
      diagnosis: "malignant",
      probability_malignant: 0.96,
    },
  ],
  disclaimer: "x",
};
const stats = { total: 0, malignant: 0, last_24h: 0, by_model: [], recent: [] };

function mockFetch() {
  const fn = vi.fn(async (url: string) => {
    const body = url.endsWith("/api/models") ? models : url.endsWith("/stats") ? stats : prediction;
    return new Response(JSON.stringify(body), { status: 200 });
  });
  vi.stubGlobal("fetch", fn);
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as never;
  return fn;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("features", () => {
  it("has 30 features in training order", () => {
    expect(FEATURES).toHaveLength(30);
    expect(FEATURES[7]).toBe("concave points_mean");
    expect(FEATURES[29]).toBe("fractal_dimension_worst");
  });

  it("validates values", () => {
    expect(parseValues(PRESETS.benign).ok).toBe(true);
    const bad = parseValues({ ...PRESETS.benign, radius_mean: "", area_mean: "-3" });
    expect(bad.ok).toBe(false);
    if (!bad.ok)
      expect(bad.errors).toEqual({ radius_mean: "Required", area_mean: "Must be 0 or more" });
  });
});

describe("App", () => {
  it("shows the disclaimer and runs a prediction from the malignant preset", async () => {
    const fetchMock = mockFetch();
    render(<App />);
    expect(screen.getByRole("note", { name: /medical disclaimer/i })).toHaveTextContent(
      /not a medical device/i,
    );
    expect(screen.getByText(/no prediction yet/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /malignant sample/i }));
    expect(screen.getByLabelText("Radius", { selector: "#f-radius_mean" })).toHaveValue(17.99);
    await userEvent.click(screen.getByRole("button", { name: /run prediction/i }));

    await waitFor(() => expect(screen.getByText("Malignant pattern")).toBeInTheDocument());
    expect(screen.getByText(/1 of 1 agree/)).toBeInTheDocument();
    const call = fetchMock.mock.calls.find(([u]) => String(u).endsWith("/api/predict"))!;
    const sent = JSON.parse((call as unknown as [string, RequestInit])[1].body as string);
    expect(sent.features).toHaveLength(30);
    expect(sent.features[0]).toBe(17.99);
  });

  it("blocks submit and flags empty fields", async () => {
    const fetchMock = mockFetch();
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: /^clear$/i }));
    await userEvent.click(screen.getByRole("button", { name: /run prediction/i }));
    expect(screen.getAllByText("Required").length).toBeGreaterThan(0);
    expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith("/api/predict"))).toBe(false);
  });
});

describe("measurement tabs", () => {
  it("move with the arrow keys", async () => {
    mockFetch();
    render(<App />);
    const tabs = screen.getAllByRole("tab");
    tabs[0].focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(tabs[1]).toHaveAttribute("aria-selected", "true");
    expect(tabs[1]).toHaveFocus();
    await userEvent.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(tabs[2]).toHaveAttribute("aria-selected", "true");
  });
});
