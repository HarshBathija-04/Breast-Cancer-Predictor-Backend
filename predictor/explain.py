"""Plain-language explanation of a prediction via Groq (server side only)."""

import groq

SYSTEM = (
    "You explain the output of an educational breast-cancer classifier to a non-specialist. "
    "The model was trained on the Wisconsin Diagnostic Breast Cancer dataset: 30 measurements of "
    "cell nuclei from fine-needle aspirate images. Rules: never present this as a diagnosis; "
    "say clearly that only a doctor and proper tests can diagnose; do not recommend treatments; "
    "be calm, factual and brief (under 180 words); use short paragraphs and plain words, no "
    "markdown tables or headings; explain what the most influential measurements suggest by "
    "comparing them with the typical benign and malignant values given; end by encouraging the "
    "reader to talk to a clinician."
)


class ExplainError(Exception):
    def __init__(self, status, code, message):
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


def build_prompt(model_name, accuracy, diagnosis, prob, drivers):
    verdict = f"Prediction: {diagnosis}"
    if prob is not None:
        verdict += f", estimated probability of malignancy {prob:.0%}"
    lines = [
        f"Model: {model_name} (hold-out accuracy {accuracy:.1%}).",
        verdict + ".",
        "Most influential measurements (value | typical benign median | typical malignant median):",
    ]
    lines += [
        f"- {d['feature']}: {d['value']:g} | {d['benign_median']:g} | {d['malignant_median']:g}"
        for d in drivers
    ]
    return "\n".join(lines)


def explain(api_key, model, prompt):
    if not api_key:
        raise ExplainError(503, "ai_unavailable", "AI explanations are not configured on this server.")
    client = groq.Groq(api_key=api_key, timeout=30, max_retries=1)
    try:
        resp = client.chat.completions.create(
            model=model,
            messages=[{"role": "system", "content": SYSTEM}, {"role": "user", "content": prompt}],
            temperature=0.3,
            max_completion_tokens=900,
            reasoning_effort="low",
        )
    except groq.RateLimitError:
        raise ExplainError(429, "ai_rate_limited", "The AI service is busy. Please try again in a minute.")
    except (groq.APITimeoutError, groq.APIConnectionError):
        raise ExplainError(504, "ai_timeout", "The AI service did not respond in time. Please retry.")
    except groq.APIError:
        raise ExplainError(502, "ai_error", "The AI service returned an error. Please retry later.")
    text = (resp.choices[0].message.content or "").strip()
    if not text:
        raise ExplainError(502, "ai_empty", "The AI service returned an empty answer. Please retry.")
    return text
