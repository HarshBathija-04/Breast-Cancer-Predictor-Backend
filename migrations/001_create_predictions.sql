CREATE TABLE IF NOT EXISTS predictions (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    model_id TEXT NOT NULL,
    features JSONB NOT NULL,
    label SMALLINT NOT NULL CHECK (label IN (0, 1)),
    probability_malignant DOUBLE PRECISION CHECK (probability_malignant BETWEEN 0 AND 1),
    source TEXT NOT NULL DEFAULT 'api' CHECK (source IN ('api', 'seed'))
);

CREATE INDEX IF NOT EXISTS predictions_created_at_idx ON predictions (created_at DESC);
