"""Static facts about the dataset and the trained models shipped in models/."""

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODELS_DIR = ROOT / "models"
METRICS_PATH = MODELS_DIR / "metrics.json"

# Exact column order and names used at training time (WDBC / data.csv).
FEATURES = [
    f"{base}_{stat}"
    for stat in ("mean", "se", "worst")
    for base in (
        "radius",
        "texture",
        "perimeter",
        "area",
        "smoothness",
        "compactness",
        "concavity",
        "concave points",
        "symmetry",
        "fractal_dimension",
    )
]

# id -> (display name, pickle file). Order = display order.
MODELS = {
    "random_forest_tuned": ("Random Forest (tuned)", "random_forest_tuned.pkl"),
    "random_forest": ("Random Forest", "random_forest.pkl"),
    "xgboost": ("XGBoost", "xgboost.pkl"),
    "decision_tree": ("Decision Tree", "decision_tree.pkl"),
    "logistic_regression": ("Logistic Regression", "logistic_regression.pkl"),
    "svc": ("Support Vector Machine", "svc.pkl"),
    "knn": ("k-Nearest Neighbors", "knn.pkl"),
}
DEFAULT_MODEL = "random_forest_tuned"
