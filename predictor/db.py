import json
from pathlib import Path

import psycopg
from psycopg.rows import dict_row

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"


def connect(cfg):
    # shortcut: one connection per request, fine at demo traffic; add psycopg_pool if load grows.
    return psycopg.connect(
        cfg.database_url,
        options=f"-c search_path={cfg.db_schema}",
        connect_timeout=10,
        row_factory=dict_row,
        autocommit=True,
    )


def ping(cfg):
    with connect(cfg) as conn:
        conn.execute("SELECT 1")


def log_prediction(cfg, model_id, values, label, prob, source="api"):
    with connect(cfg) as conn:
        row = conn.execute(
            "INSERT INTO predictions (model_id, features, label, probability_malignant, source)"
            " VALUES (%s, %s, %s, %s, %s) RETURNING id",
            (model_id, json.dumps(values), label, prob, source),
        ).fetchone()
    return row["id"]


def stats(cfg):
    with connect(cfg) as conn:
        totals = conn.execute(
            "SELECT count(*) AS total, count(*) FILTER (WHERE label = 1) AS malignant,"
            " count(*) FILTER (WHERE created_at > now() - interval '24 hours') AS last_24h"
            " FROM predictions"
        ).fetchone()
        by_model = conn.execute(
            "SELECT model_id, count(*) AS count FROM predictions GROUP BY model_id ORDER BY count DESC"
        ).fetchall()
        recent = conn.execute(
            "SELECT id, created_at, model_id, label, probability_malignant FROM predictions"
            " ORDER BY created_at DESC, id DESC LIMIT 8"
        ).fetchall()
    for r in recent:
        r["created_at"] = r["created_at"].isoformat()
    return {**totals, "by_model": by_model, "recent": recent}


def migrate(cfg):
    """Apply migrations/*.sql in name order, each once, inside the app's own schema."""
    with psycopg.connect(cfg.database_url, autocommit=True, connect_timeout=10) as conn:
        conn.execute(f'CREATE SCHEMA IF NOT EXISTS "{cfg.db_schema}"')
        conn.execute(f'SET search_path TO "{cfg.db_schema}"')
        conn.execute(
            "CREATE TABLE IF NOT EXISTS schema_migrations"
            " (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())"
        )
        done = {r[0] for r in conn.execute("SELECT version FROM schema_migrations")}
        applied = []
        for path in sorted(MIGRATIONS_DIR.glob("*.sql")):
            if path.name in done:
                continue
            with conn.transaction():
                conn.execute(path.read_text())
                conn.execute("INSERT INTO schema_migrations (version) VALUES (%s)", (path.name,))
            applied.append(path.name)
    return applied
