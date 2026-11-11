"""WSGI entry point: gunicorn app:app (local dev: python app.py)."""

import logging
import os

from predictor.app import create_app

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
app = create_app()

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.environ.get("PORT", 5108)), debug=False)
