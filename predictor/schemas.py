import math
from typing import Literal

from pydantic import BaseModel, ConfigDict, field_validator

from .catalog import DEFAULT_MODEL, FEATURES, MODELS

ModelId = Literal[tuple(MODELS)]  # type: ignore[valid-type]
# Largest training value is area_worst ~4254; anything far beyond is a typo, not a tumour.
MAX_VALUE = 10_000.0


class PredictIn(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    model: ModelId = DEFAULT_MODEL
    # Either {feature_name: value} or the 30 values in training column order.
    features: dict[str, float] | list[float]
    compare: bool = True

    @field_validator("features")
    @classmethod
    def to_ordered_list(cls, v):
        if isinstance(v, dict):
            missing = [f for f in FEATURES if f not in v]
            unknown = [k for k in v if k not in FEATURES]
            if missing or unknown:
                raise ValueError(f"missing features: {missing}; unknown features: {unknown}")
            v = [v[f] for f in FEATURES]
        if len(v) != len(FEATURES):
            raise ValueError(f"expected {len(FEATURES)} values, got {len(v)}")
        for name, x in zip(FEATURES, v, strict=True):
            if not math.isfinite(x) or not 0 <= x <= MAX_VALUE:
                raise ValueError(f"{name} must be a number between 0 and {MAX_VALUE:g}")
        return v
