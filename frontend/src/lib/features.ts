// Mirrors predictor/catalog.py FEATURES (training column order). The API validates the exact names.
export const BASES = [
  { key: "radius", label: "Radius", hint: "Mean distance from centre to perimeter (µm-scaled)" },
  { key: "texture", label: "Texture", hint: "Std. deviation of grey-scale values" },
  { key: "perimeter", label: "Perimeter", hint: "Nucleus boundary length" },
  { key: "area", label: "Area", hint: "Nucleus area" },
  { key: "smoothness", label: "Smoothness", hint: "Local variation in radius lengths" },
  { key: "compactness", label: "Compactness", hint: "Perimeter² / area − 1.0" },
  { key: "concavity", label: "Concavity", hint: "Severity of concave contour portions" },
  { key: "concave points", label: "Concave points", hint: "Number of concave contour portions" },
  { key: "symmetry", label: "Symmetry", hint: "Symmetry of the nucleus" },
  { key: "fractal_dimension", label: "Fractal dimension", hint: "“Coastline approximation” − 1" },
] as const;

export const GROUPS = [
  { stat: "mean", label: "Mean", description: "Average across all nuclei in the image" },
  { stat: "se", label: "Standard error", description: "Variation of each measurement" },
  { stat: "worst", label: "Worst", description: "Mean of the three largest values" },
] as const;

export const FEATURES: string[] = GROUPS.flatMap((g) => BASES.map((b) => `${b.key}_${g.stat}`));

export type FeatureValues = Record<string, string>;

const toValues = (nums: number[]): FeatureValues =>
  Object.fromEntries(FEATURES.map((f, i) => [f, String(nums[i])]));

// Real rows from the WDBC dataset (sample IDs 842302 and 8510426).
export const PRESETS = {
  malignant: toValues([
    17.99, 10.38, 122.8, 1001.0, 0.1184, 0.2776, 0.3001, 0.1471, 0.2419, 0.07871, 1.095, 0.9053,
    8.589, 153.4, 0.006399, 0.04904, 0.05373, 0.01587, 0.03003, 0.006193, 25.38, 17.33, 184.6,
    2019.0, 0.1622, 0.6656, 0.7119, 0.2654, 0.4601, 0.1189,
  ]),
  benign: toValues([
    13.54, 14.36, 87.46, 566.3, 0.09779, 0.08129, 0.06664, 0.04781, 0.1885, 0.05766, 0.2699, 0.7886,
    2.058, 23.56, 0.008462, 0.0146, 0.02387, 0.01315, 0.0198, 0.0023, 15.11, 19.26, 99.7, 711.2,
    0.144, 0.1773, 0.239, 0.1288, 0.2977, 0.07259,
  ]),
};

export const emptyValues = (): FeatureValues => Object.fromEntries(FEATURES.map((f) => [f, ""]));

export function featureLabel(name: string): string {
  const i = name.lastIndexOf("_");
  const base = BASES.find((b) => b.key === name.slice(0, i))?.label ?? name;
  const group = GROUPS.find((g) => g.stat === name.slice(i + 1))?.label ?? "";
  return `${base} (${group.toLowerCase()})`;
}

/** Returns per-field errors, or the 30 parsed numbers when everything is valid. */
export function parseValues(
  values: FeatureValues,
): { ok: true; numbers: number[] } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const numbers = FEATURES.map((f) => {
    const raw = values[f]?.trim() ?? "";
    const n = Number(raw);
    if (raw === "") errors[f] = "Required";
    else if (!Number.isFinite(n)) errors[f] = "Enter a number";
    else if (n < 0) errors[f] = "Must be 0 or more";
    else if (n > 10000) errors[f] = "Too large";
    return n;
  });
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, numbers };
}
