import logging
from functools import cache

from flask import Flask, abort, jsonify, request
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from pydantic import ValidationError
from werkzeug.exceptions import HTTPException
from werkzeug.middleware.proxy_fix import ProxyFix

from . import db
from .catalog import DEFAULT_MODEL, FEATURES, MODELS
from .config import Config
from .explain import ExplainError, build_prompt, explain
from .ml import ModelRegistry
from .schemas import PredictIn

log = logging.getLogger("predictor")
DISCLAIMER = (
    "Educational demo only. Not a medical device and not a diagnosis. Always consult a qualified clinician."
)
get_registry = cache(ModelRegistry)


def error(status, code, message, details=None):
    body = {"error": {"code": code, "message": message}}
    if details:
        body["error"]["details"] = details
    return jsonify(body), status


def create_app(cfg=None):
    cfg = cfg or Config()
    registry = get_registry()  # load all models once, at startup
    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = 16 * 1024
    app.json.sort_keys = False
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1)  # Render sits behind one proxy
    CORS(app, origins=cfg.frontend_urls, methods=["GET", "POST"], max_age=3600)
    limiter = Limiter(
        get_remote_address,
        app=app,
        default_limits=["300 per minute"],
        storage_uri=cfg.rate_limit_storage,
        headers_enabled=True,
    )

    @app.after_request
    def security_headers(resp):
        resp.headers["X-Content-Type-Options"] = "nosniff"
        resp.headers["X-Frame-Options"] = "DENY"
        resp.headers["Referrer-Policy"] = "no-referrer"
        resp.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
        resp.headers["Cross-Origin-Opener-Policy"] = "same-origin"
        if cfg.production:
            resp.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return resp

    @app.errorhandler(ValidationError)
    def on_validation(e):
        details = [
            {"field": ".".join(str(p) for p in err["loc"]), "message": err["msg"]}
            for err in e.errors(include_url=False, include_input=False)
        ]
        return error(422, "validation_error", "Request body is invalid.", details)

    @app.errorhandler(ExplainError)
    def on_explain(e):
        return error(e.status, e.code, e.message)

    @app.errorhandler(HTTPException)
    def on_http(e):
        return error(e.code, (e.name or "error").lower().replace(" ", "_"), e.description or e.name)

    @app.errorhandler(Exception)
    def on_unexpected(e):
        log.exception("unhandled error")
        return error(500, "internal_error", "Something went wrong on our side.")

    def parse_body():
        body = request.get_json(silent=True)
        if not isinstance(body, dict):
            abort(400, "Expected a JSON object body.")
        return PredictIn.model_validate(body)

    def run_prediction(model_id, values):
        label, prob = registry.predict(model_id, values)
        return {
            "label": label,
            "diagnosis": "malignant" if label == 1 else "benign",
            "probability_malignant": prob,
        }

    @app.get("/health")
    @limiter.exempt
    def health():
        try:
            db.ping(cfg)
            return jsonify(status="ok", db="ok")
        except Exception:
            log.exception("health check: database unreachable")
            return jsonify(status="degraded", db="error"), 503

    @app.get("/api/models")
    def models():
        return jsonify(
            default_model=DEFAULT_MODEL,
            dataset=registry.metrics["dataset"],
            test_size=registry.metrics["test_size"],
            models=[registry.describe(m) for m in MODELS],
        )

    @app.get("/api/features")
    def features():
        return jsonify(features=FEATURES, stats=registry.metrics["feature_stats"])

    @app.post("/api/predict")
    @limiter.limit("60 per minute")
    def predict():
        body = parse_body()
        result = run_prediction(body.model, body.features)
        prediction_id = None
        try:
            prediction_id = db.log_prediction(
                cfg, body.model, body.features, result["label"], result["probability_malignant"]
            )
        except Exception:
            # Logging is best-effort: a DB outage must not block the prediction itself.
            log.exception("failed to log prediction")
        comparison = None
        if body.compare:
            comparison = [{"id": m, "name": MODELS[m][0], **run_prediction(m, body.features)} for m in MODELS]
        return jsonify(
            id=prediction_id,
            logged=prediction_id is not None,
            model={"id": body.model, "name": MODELS[body.model][0]},
            prediction=result,
            out_of_range=registry.out_of_range(body.features),
            comparison=comparison,
            disclaimer=DISCLAIMER,
        )

    @app.post("/api/explain")
    @limiter.limit("10 per minute; 100 per day")
    def explain_prediction():
        body = parse_body()
        # Recompute server-side so the explanation always matches the real model output.
        result = run_prediction(body.model, body.features)
        stats = registry.metrics["feature_stats"]
        values = dict(zip(FEATURES, body.features, strict=True))
        top = sorted(FEATURES, key=registry.importances.get, reverse=True)[:6]
        drivers = [
            {
                "feature": f,
                "value": values[f],
                "benign_median": round(stats[f]["benign_median"], 4),
                "malignant_median": round(stats[f]["malignant_median"], 4),
            }
            for f in top
        ]
        prompt = build_prompt(
            MODELS[body.model][0],
            registry.metrics["models"][body.model]["accuracy"],
            result["diagnosis"],
            result["probability_malignant"],
            drivers,
        )
        text = explain(cfg.groq_api_key, cfg.groq_model, prompt)
        return jsonify(explanation=text, prediction=result, drivers=drivers, disclaimer=DISCLAIMER)

    @app.get("/api/predictions/stats")
    def prediction_stats():
        try:
            return jsonify(db.stats(cfg))
        except Exception:
            log.exception("stats query failed")
            return error(503, "db_unavailable", "Prediction history is temporarily unavailable.")

    @app.post("/predict")
    @limiter.limit("60 per minute")
    def legacy_predict():
        """Original v1 contract ({"features": [30 numbers]} -> {"prediction": 0|1}), kept for old clients."""
        body = parse_body()
        return jsonify(prediction=run_prediction(body.model, body.features)["label"])

    return app
