"""Loads every trained model once and serves predictions."""

import json
import pickle
import warnings

import pandas as pd

from .catalog import DEFAULT_MODEL, FEATURES, METRICS_PATH, MODELS, MODELS_DIR


class ModelRegistry:
    def __init__(self):
        self.metrics = json.loads(METRICS_PATH.read_text())
        self.estimators = {}
        with warnings.catch_warnings():
            # XGBoost warns that the pickle came from an older version; it still loads and scores identically.
            warnings.simplefilter("ignore", UserWarning)
            for model_id, (_, file) in MODELS.items():
                with open(MODELS_DIR / file, "rb") as fh:
                    # Trusted artifacts committed to this repo; never unpickle user input.
                    self.estimators[model_id] = pickle.load(fh).best_estimator_
        rf = self.estimators[DEFAULT_MODEL]
        self.importances = dict(zip(FEATURES, (float(v) for v in rf.feature_importances_), strict=True))

    def predict(self, model_id, values):
        est = self.estimators[model_id]
        frame = pd.DataFrame([values], columns=FEATURES)
        label = int(est.predict(frame)[0])
        prob = float(est.predict_proba(frame)[0][1]) if hasattr(est, "predict_proba") else None
        return label, prob

    def out_of_range(self, values):
        stats = self.metrics["feature_stats"]
        return [
            f for f, v in zip(FEATURES, values, strict=True) if not stats[f]["min"] <= v <= stats[f]["max"]
        ]

    def describe(self, model_id):
        m = self.metrics["models"][model_id]
        return {"id": model_id, "name": MODELS[model_id][0], **m}
