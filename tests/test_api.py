import os

import groq
import httpx
import psycopg
import pytest

from predictor import app as app_module
from predictor import db
from predictor.catalog import FEATURES, MODELS
from predictor.config import Config
from predictor.explain import ExplainError, explain
from predictor.migrate import seed

DB_URL = os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@localhost:5433/portfolio")
SCHEMA = "breast_cancer_test"

# Real WDBC rows: index 0 is malignant, index 19 is benign.
MALIGNANT = [17.99, 10.38, 122.8, 1001.0, 0.1184, 0.2776, 0.3001, 0.1471, 0.2419, 0.07871,
             1.095, 0.9053, 8.589, 153.4, 0.006399, 0.04904, 0.05373, 0.01587, 0.03003, 0.006193,
             25.38, 17.33, 184.6, 2019.0, 0.1622, 0.6656, 0.7119, 0.2654, 0.4601, 0.1189]  # fmt: skip
BENIGN = [13.54, 14.36, 87.46, 566.3, 0.09779, 0.08129, 0.06664, 0.04781, 0.1885, 0.05766,
          0.2699, 0.7886, 2.058, 23.56, 0.008462, 0.0146, 0.02387, 0.01315, 0.0198, 0.0023,
          15.11, 19.26, 99.7, 711.2, 0.144, 0.1773, 0.239, 0.1288, 0.2977, 0.07259]  # fmt: skip


def db_available():
    try:
        psycopg.connect(DB_URL, connect_timeout=3).close()
        return True
    except psycopg.Error:
        return False


needs_db = pytest.mark.skipif(not db_available(), reason="Postgres not reachable")


@pytest.fixture(scope="session")
def cfg():
    return Config({"DATABASE_URL": DB_URL, "DB_SCHEMA": SCHEMA, "FRONTEND_URL": "http://localhost:5204"})


@pytest.fixture(scope="session")
def migrated(cfg):
    if not db_available():
        pytest.skip("Postgres not reachable")
    with psycopg.connect(DB_URL, autocommit=True) as conn:
        conn.execute(f'DROP SCHEMA IF EXISTS "{SCHEMA}" CASCADE')  # test schema only
    db.migrate(cfg)
    return cfg


@pytest.fixture()
def client(cfg):
    return app_module.create_app(cfg).test_client()


def test_config_rejects_unsafe_schema():
    with pytest.raises(ValueError):
        Config({"DB_SCHEMA": "x; DROP TABLE users"})


@pytest.mark.parametrize("model_id", list(MODELS))
def test_every_model_separates_textbook_cases(model_id):
    registry = app_module.get_registry()
    assert registry.predict(model_id, MALIGNANT)[0] == 1
    assert registry.predict(model_id, BENIGN)[0] == 0


@needs_db
def test_health_ok(client, migrated):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.get_json() == {"status": "ok", "db": "ok"}
    assert r.headers["X-Content-Type-Options"] == "nosniff"


def test_health_reports_db_down():
    bad = Config({"DATABASE_URL": "postgresql://nobody:x@127.0.0.1:1/none"})
    r = app_module.create_app(bad).test_client().get("/health")
    assert r.status_code == 503
    assert r.get_json()["db"] == "error"


@needs_db
def test_predict_logs_and_compares(client, migrated):
    r = client.post("/api/predict", json={"features": dict(zip(FEATURES, MALIGNANT, strict=True))})
    body = r.get_json()
    assert r.status_code == 200, body
    assert body["prediction"]["diagnosis"] == "malignant"
    assert 0.5 < body["prediction"]["probability_malignant"] <= 1
    assert body["logged"] is True and isinstance(body["id"], int)
    assert [c["id"] for c in body["comparison"]] == list(MODELS)
    assert body["out_of_range"] == []
    stats = client.get("/api/predictions/stats").get_json()
    assert stats["total"] >= 1 and stats["recent"][0]["id"] == body["id"]


def test_predict_without_db_still_answers():
    bad = Config({"DATABASE_URL": "postgresql://nobody:x@127.0.0.1:1/none"})
    r = (
        app_module.create_app(bad)
        .test_client()
        .post("/api/predict", json={"model": "svc", "features": BENIGN, "compare": False})
    )
    body = r.get_json()
    assert r.status_code == 200
    assert body["logged"] is False and body["comparison"] is None
    assert body["prediction"] == {"label": 0, "diagnosis": "benign", "probability_malignant": None}


def test_out_of_range_is_flagged(client):
    values = list(BENIGN)
    values[3] = 9000.0  # area_mean far above anything in training
    body = client.post("/api/predict", json={"features": values, "compare": False}).get_json()
    assert body["out_of_range"] == ["area_mean"]


@pytest.mark.parametrize(
    "payload",
    [
        {"features": [1.0] * 29},
        {"features": [1.0] * 29 + [-1.0]},
        {"features": [1.0] * 29 + [1e9]},
        {"features": {"radius_mean": 1.0}},
        {"features": BENIGN, "model": "gpt"},
        {"features": BENIGN, "extra": 1},
        {"features": ["a"] * 30},
    ],
)
def test_predict_rejects_bad_input(client, payload):
    r = client.post("/api/predict", json=payload)
    assert r.status_code == 422
    assert r.get_json()["error"]["code"] == "validation_error"


def test_predict_rejects_non_json(client):
    r = client.post("/api/predict", data="nope", content_type="text/plain")
    assert r.status_code == 400
    assert r.get_json()["error"]["code"] == "bad_request"


def test_legacy_predict_contract(client):
    assert client.post("/predict", json={"features": MALIGNANT}).get_json() == {"prediction": 1}


def test_models_endpoint_has_metrics(client):
    body = client.get("/api/models").get_json()
    assert body["default_model"] == "random_forest_tuned"
    best = body["models"][0]
    assert best["accuracy"] == pytest.approx(0.9825, abs=1e-4)  # matches the notebook
    assert set(best["confusion_matrix"]) == {"tn", "fp", "fn", "tp"}


def test_cors_only_allows_frontend(client):
    ok = client.options("/api/predict", headers={"Origin": "http://localhost:5204"})
    evil = client.options("/api/predict", headers={"Origin": "https://evil.example"})
    assert ok.headers.get("Access-Control-Allow-Origin") == "http://localhost:5204"
    assert "Access-Control-Allow-Origin" not in evil.headers


def test_explain_uses_server_side_prediction(client, monkeypatch):
    seen = {}

    def fake(key, model, prompt):
        seen["prompt"] = prompt
        return "Plain explanation."

    monkeypatch.setattr(app_module, "explain", fake)
    body = client.post("/api/explain", json={"features": MALIGNANT}).get_json()
    assert body["explanation"] == "Plain explanation."
    assert body["prediction"]["diagnosis"] == "malignant"
    assert "Prediction: malignant" in seen["prompt"]
    assert len(body["drivers"]) == 6


def test_explain_without_key_is_503(client):
    r = client.post("/api/explain", json={"features": BENIGN})
    assert r.status_code == 503
    assert r.get_json()["error"]["code"] == "ai_unavailable"


def test_explain_maps_rate_limit(monkeypatch):
    req = httpx.Request("POST", "https://api.groq.com")
    err = groq.RateLimitError("slow down", response=httpx.Response(429, request=req), body=None)

    class FakeGroq:
        def __init__(self, **_):
            self.chat = self
            self.completions = self

        def create(self, **_):
            raise err

    monkeypatch.setattr(groq, "Groq", FakeGroq)
    with pytest.raises(ExplainError) as exc:
        explain("key", "openai/gpt-oss-120b", "prompt")
    assert exc.value.status == 429


@needs_db
def test_seed_is_idempotent(migrated):
    registry = app_module.get_registry()
    first = seed(migrated, registry)
    assert seed(migrated, registry) == 0
    with db.connect(migrated) as conn:
        count = conn.execute("SELECT count(*) AS n FROM predictions WHERE source = 'seed'").fetchone()["n"]
    assert first in (0, count) and count > 0
    assert db.migrate(migrated) == []
