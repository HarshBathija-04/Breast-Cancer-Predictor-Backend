"""Apply migrations and the idempotent demo seed: python -m predictor.migrate"""

import json
import random
from datetime import UTC, datetime, timedelta

from sklearn.datasets import load_breast_cancer

from . import db
from .catalog import MODELS
from .config import Config
from .ml import ModelRegistry

SEED_ROWS = 60


def seed(cfg, registry):
    """Insert demo predictions from real WDBC samples, once (skips if seed rows exist)."""
    with db.connect(cfg) as conn:
        if conn.execute("SELECT 1 FROM predictions WHERE source = 'seed' LIMIT 1").fetchone():
            return 0
        rng = random.Random(42)
        data = load_breast_cancer().data
        now = datetime.now(UTC)
        model_ids = list(MODELS)
        weights = [6, 2, 2, 1, 1, 1, 1]  # demo traffic mostly hits the default model
        with conn.transaction():
            for i in rng.sample(range(len(data)), SEED_ROWS):
                values = [float(v) for v in data[i]]
                model_id = rng.choices(model_ids, weights)[0]
                label, prob = registry.predict(model_id, values)
                conn.execute(
                    "INSERT INTO predictions (created_at, model_id, features, label,"
                    " probability_malignant, source) VALUES (%s, %s, %s, %s, %s, 'seed')",
                    (
                        now - timedelta(minutes=rng.randint(5, 60 * 24 * 14)),
                        model_id,
                        json.dumps(values),
                        label,
                        prob,
                    ),
                )
    return SEED_ROWS


def main():
    cfg = Config()
    applied = db.migrate(cfg)
    print(f"migrations applied: {applied or 'none (up to date)'}")
    print(f"seeded rows: {seed(cfg, ModelRegistry())}")


if __name__ == "__main__":
    main()
