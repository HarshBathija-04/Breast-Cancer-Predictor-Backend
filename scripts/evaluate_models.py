"""Rebuild models/metrics.json from the shipped pickles.

Reproduces the notebook's hold-out split exactly (np.random.seed(10) then
train_test_split(test_size=0.2) on the 569-row WDBC dataset) so the numbers
match the notebook. sklearn's bundled copy has the same row order as data.csv.
Run: python scripts/evaluate_models.py
"""

import json
import pickle
import sys
import warnings
from pathlib import Path

import numpy as np
from sklearn.datasets import load_breast_cancer
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from predictor.catalog import FEATURES, METRICS_PATH, MODELS, MODELS_DIR  # noqa: E402

warnings.filterwarnings("ignore")

data = load_breast_cancer(as_frame=True)
X = data.data.copy()
X.columns = FEATURES
y = 1 - data.target  # sklearn: 0 = malignant; training used 1 = malignant (M)

np.random.seed(10)
_, x_test, _, y_test = train_test_split(X, y, test_size=0.2)

models = {}
for model_id, (name, file) in MODELS.items():
    grid = pickle.load(open(MODELS_DIR / file, "rb"))
    est = grid.best_estimator_
    pred = est.predict(x_test)
    if hasattr(est, "predict_proba"):
        score = est.predict_proba(x_test)[:, 1]
    else:
        score = est.decision_function(x_test)
    tn, fp, fn, tp = confusion_matrix(y_test, pred).ravel()
    models[model_id] = {
        "name": name,
        "algorithm": type(est).__name__,
        "best_params": {k: v for k, v in grid.best_params_.items()},
        "accuracy": round(accuracy_score(y_test, pred), 4),
        "precision": round(precision_score(y_test, pred), 4),
        "recall": round(recall_score(y_test, pred), 4),
        "f1": round(f1_score(y_test, pred), 4),
        "roc_auc": round(roc_auc_score(y_test, score), 4),
        "confusion_matrix": {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)},
        "has_probability": hasattr(est, "predict_proba"),
    }

stats = {
    f: {
        "min": float(X[f].min()),
        "max": float(X[f].max()),
        "benign_median": float(X.loc[y == 0, f].median()),
        "malignant_median": float(X.loc[y == 1, f].median()),
    }
    for f in FEATURES
}

out = {
    "dataset": "Wisconsin Diagnostic Breast Cancer (569 samples, 30 features)",
    "test_size": int(len(y_test)),
    "models": models,
    "feature_stats": stats,
}
METRICS_PATH.write_text(json.dumps(out, indent=2) + "\n")
print(f"wrote {METRICS_PATH}")
