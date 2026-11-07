# BCC VED Copilot API Contract

Base URL: `http://localhost:8000/api/v1`. Every endpoint except `POST /sessions` requires `X-Session-Token`. A workflow belongs to exactly one session; another session receives `404` rather than ownership information.

All fixtures and demo scenarios are synthetic. The API does not sign or transmit payments.

## Endpoints

| Method | Path | Result |
|---|---|---|
| POST | `/sessions` | Creates a session token |
| GET | `/fields` | Returns the exact ordered 21 visible payment definitions |
| POST | `/analyze` | Parses one contract, invoice, or other/application document; optionally appends it to `analysis_id` |
| POST | `/workflows` | Creates a four-step workflow from JSON |
| GET | `/workflows/{analysis_id}` | Returns the canonical persisted workflow |
| PATCH | `/workflows/{analysis_id}/contract` | Edits or confirms contract fields |
| PATCH | `/workflows/{analysis_id}/application` | Edits application and supporting-document fields |
| PATCH | `/workflows/{analysis_id}/payment` | Edits payment fields without automatic correction |
| POST | `/workflows/{analysis_id}/validate` | Re-runs deterministic rules without changing user values |
| POST | `/workflows/{analysis_id}/draft` | Persists and audits a draft save |
| GET | `/workflows/{analysis_id}/status` | Returns current step, blocking issue IDs, and readiness |
| GET | `/workflows/{analysis_id}/audit` | Returns actor/action/previous/new audit events |
| GET | `/contracts` | Lists selectable synthetic contracts |
| GET | `/demo/scenarios` | Lists synthetic scenarios A-F |
| POST | `/demo/run/{scenario_id}` | Creates and persists synthetic scenario A-F |

The canonical response from analyze, create, get, patch, validate, draft, and demo run contains:

```json
{
  "analysis_id": "uuid",
  "mode": "demo",
  "workflow": {
    "current_step": "payment",
    "steps": [],
    "completed_steps": ["contract", "application"],
    "blocking_issues": ["payment-purpose-amount-mismatch"],
    "next_action": "Завершите этап: Платёж."
  },
  "contract": {"document_type": "contract", "fields": {}},
  "application": {"document_type": "other", "fields": {}, "registration_review_required": false},
  "invoice": {"document_type": "invoice", "fields": {}},
  "payment": {"fields": {}, "underlying": {}, "confirmed_fields": []},
  "issues": [],
  "missing_fields": [],
  "next_actions": [],
  "ready_for_review": false
}
```

Each extracted field has stable keys: `value`, `source_document`, `source_section`, `source_excerpt`, `confidence`, `status`, and `confirmed_by_user`. Placeholder text such as `[IBAN]` is never accepted as a value.

## Fetch Examples

```js
const base = "http://localhost:8000/api/v1";
const session = await fetch(`${base}/sessions`, { method: "POST" }).then(r => r.json());
const headers = { "X-Session-Token": session.session_token, "Content-Type": "application/json" };

const fields = await fetch(`${base}/fields`, { headers }).then(r => r.json());

const scenarioC = await fetch(`${base}/demo/run/C`, {
  method: "POST",
  headers,
}).then(r => r.json());

// Manual control: the API never applies this correction automatically.
const corrected = await fetch(`${base}/workflows/${scenarioC.analysis_id}/payment`, {
  method: "PATCH",
  headers,
  body: JSON.stringify({
    fields: { payment_purpose: "Оплата по инвойсу INV-284 от 06.11.2026, 12 800 USD" },
    confirm_fields: ["payment_purpose"],
    actor: "demo-user"
  })
}).then(r => r.json());

const validated = await fetch(`${base}/workflows/${scenarioC.analysis_id}/validate`, {
  method: "POST",
  headers,
}).then(r => r.json());

const status = await fetch(`${base}/workflows/${scenarioC.analysis_id}/status`, { headers }).then(r => r.json());
const draft = await fetch(`${base}/workflows/${scenarioC.analysis_id}/draft`, { method: "POST", headers }).then(r => r.json());
```

Document analysis uses multipart form data:

```js
const body = new FormData();
body.append("document_type", "invoice"); // contract | invoice | other
body.append("file", file);
// body.append("analysis_id", existingAnalysisId); // optional
const workflow = await fetch(`${base}/analyze`, {
  method: "POST",
  headers: { "X-Session-Token": session.session_token },
  body
}).then(r => r.json());
```

For a qualifying import/export contract over `50 000 USD`, or one without a stated amount, validation sets `application.registration_review_required` and adds a review warning if the registration number is absent. This demonstration rule is not generalized to every currency contract.

## Errors and CORS

Errors use `{"request_id":"uuid","errors":[{"code":"...","message":"...","field":null}]}` and never expose parser/provider exceptions. CORS permits `http://localhost:5173` and `FRONTEND_ORIGIN`, including `PATCH` and `X-Session-Token`. The frontend must set `VITE_API_BASE_URL=http://localhost:8000`; never expose `OPENAI_API_KEY` through a Vite variable. Store it only in `ai-backend/.env`.
