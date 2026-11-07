# BCC VED Copilot Backend

Python 3.12+ FastAPI backend implementing the four frontend screens: currency contract, registration/review application, currency payment, and simulated status. The invoice is a supporting document, not a separate screen. See `API_CONTRACT.md` for the exact API and fetch examples.

The repository had no original documents. Every bundled fixture and demo scenario is synthetic and labeled accordingly.

## Install and Run

```powershell
python -m pip install -r requirements.txt
Copy-Item .env.example .env
python -m uvicorn app.main:app --reload --port 8000
```

Environment variables are `OPENAI_API_KEY`, `OPENAI_MODEL`, `AI_DEMO_MODE`, `FRONTEND_ORIGIN`, and `DATABASE_URL`. Put the secret key in `ai-backend/.env`, never in frontend code. With `AI_DEMO_MODE=true`, extraction and scenarios are deterministic and require no key. With demo mode disabled and a key present, `/analyze` uses the official OpenAI SDK and `responses.parse()` with a Pydantic structured output; deterministic extraction is the safe fallback.

```powershell
python -m pytest
python scripts/generate_types.py
```

Generated frontend exports are under `generated/frontend-types/`.

## MVP Boundaries

- No signing, bank submission, sanctions screening, exchange-rate conversion, or OCR.
- Raw documents are parsed in memory and are not persisted. Extraction metadata is persisted.
- SQLite and the in-process rate limiter are intended for a single-node demo.
- Registration review uses the requested demonstration rule for a qualifying import/export contract over `50 000 USD` (or without an amount). It does not apply the threshold to each invoice and is not a legal conclusion.
