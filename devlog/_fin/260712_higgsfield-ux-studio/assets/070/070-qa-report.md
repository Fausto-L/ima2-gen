# 070 — 3-provider character element QA

- Run date: `2026-07-19` KST
- Server: `http://127.0.0.1:3333` (existing process; no server started)
- Element: `a_01KXQZXJSWEERY7A2PT5WXQ1V7`, `character`, two refs
- Generation requests: **exactly 3 / 3** (`oauth` → `gemini-api` → `grok`)
- Retries by this QA task: **0**
- Overall QA result: **FAIL** — Gemini blocked; both successful results stored `refsCount: 0` and visually exhibit major face/outfit drift

Visual comparison: [070-drift-comparison.png](./070-drift-comparison.png)

## Fixed fixture

Ref order:

1. `1784131394336_776db756_0.png` — front/full-body
2. `1784131393219_6b239780_0.png` — different pose

Raw prompt used unchanged for all three requests:

> Full-body illustration of the referenced character standing at a quiet city bus stop at golden hour, facing the camera with a relaxed smile, wearing the character original outfit, clean background, no text.

Common request fields were `elementIds:["a_01KXQZXJSWEERY7A2PT5WXQ1V7"]`, `n:1`,
`webSearchEnabled:false`, and `size:"1024x1024"`. No composer references were supplied.

## Provider matrix

| Provider | Generation status | QA status | Model | Filename | Refs expected / stored | Face drift | Outfit drift |
|---|---|---|---|---|---:|---|---|
| `oauth` | **OK**, HTTP 200 | **FAIL** | `gpt-5.6-luna` | `1784397747084_93f6fc88_0.png` | 2 / **0** | major | major |
| `gemini-api` | **BLOCKED**, HTTP 400 | **BLOCKED** | catalog default `nano-banana-2` | none | 2 / n/a | n/a | n/a |
| `grok` | **OK**, HTTP 200 | **FAIL** | `grok-imagine-image-quality` | `1784397799946_9f8d875a_0.jpeg` | 2 / **0** | major | major |

The provider capacities are GPT 6, Gemini 6, and Grok 4 refs. Two refs fit all three
capacities, so no capacity drop was expected.

Both successful outputs are square, but OAuth has another response/file mismatch: response and
sidecar say `1024x1024`, while the copied PNG is actually `1254x1254`. Grok is actually
`1024x1024` as declared.

## Request and response ledger

### OAuth

- Started: `2026-07-18T17:59:09Z`
- Finished: `2026-07-18T18:02:27Z`
- requestId: `req_be16cfc5-59ac-4e49-b88e-d7480678d324`
- HTTP: `200`
- elapsed: `197.9s`

Request body:

```json
{
  "prompt": "Full-body illustration of the referenced character standing at a quiet city bus stop at golden hour, facing the camera with a relaxed smile, wearing the character original outfit, clean background, no text.",
  "elementIds": ["a_01KXQZXJSWEERY7A2PT5WXQ1V7"],
  "provider": "oauth",
  "n": 1,
  "webSearchEnabled": false,
  "size": "1024x1024"
}
```

Response metadata (inline base64 image omitted; full revised prompt and usage are preserved in
`results/gpt-oauth/sidecar-sanitized.json`):

```json
{
  "elapsed": 197.9,
  "filename": "1784397747084_93f6fc88_0.png",
  "requestId": "req_be16cfc5-59ac-4e49-b88e-d7480678d324",
  "providerUrl": null,
  "createdAt": 1784397747084,
  "usage": {
    "input_tokens": 3657,
    "input_tokens_details": {"cache_write_tokens": 0, "cached_tokens": 0},
    "output_tokens": 433,
    "output_tokens_details": {"reasoning_tokens": 81},
    "total_tokens": 4090
  },
  "provider": "oauth",
  "reasoningEffort": "medium",
  "webSearchCalls": 0,
  "quality": "medium",
  "size": "1024x1024",
  "moderation": "low",
  "model": "gpt-5.6-luna",
  "warnings": [],
  "promptMode": "auto",
  "webSearchEnabled": false
}
```

### Gemini API

- Started/finished: `2026-07-18T18:02:37Z`
- requestId: `req_46c3ff68-84ff-44a2-888e-587aaa858fa3`
- HTTP: `400`
- Status: **BLOCKED**; provider error, no retry

Request body:

```json
{
  "prompt": "Full-body illustration of the referenced character standing at a quiet city bus stop at golden hour, facing the camera with a relaxed smile, wearing the character original outfit, clean background, no text.",
  "elementIds": ["a_01KXQZXJSWEERY7A2PT5WXQ1V7"],
  "provider": "gemini-api",
  "n": 1,
  "webSearchEnabled": false,
  "size": "1024x1024"
}
```

Full response:

```json
{
  "error": "Gemini API error: {\n  \"error\": {\n    \"code\": 400,\n    \"message\": \"Invalid value at 'generation_config.response_format.image.aspect_ratio' (type.googleapis.com/google.ai.generativelanguage.v1beta.ImageResponseFormat.Asp",
  "code": "GEMINI_API_BAD_REQUEST",
  "upstreamCode": null,
  "upstreamType": null,
  "upstreamParam": null,
  "diagnosticReason": null,
  "retryKind": null,
  "initialEventCount": null,
  "initialEventTypes": null,
  "hadReferences": null,
  "referencesDroppedOnRetry": null,
  "developerPromptDroppedOnRetry": null,
  "webSearchDroppedOnRetry": null,
  "fallbackEventCount": null,
  "fallbackEventTypes": null,
  "fallbackImageCallSeen": null,
  "fallbackImageResultCount": null,
  "errorEventCount": null,
  "eventTypes": null,
  "webSearchCalls": null,
  "responseDiagnostics": null,
  "toolTypes": null,
  "toolChoiceKind": null,
  "requestId": "req_46c3ff68-84ff-44a2-888e-587aaa858fa3"
}
```

Exact provider message: `Invalid value at 'generation_config.response_format.image.aspect_ratio'`.
No auth/config mutation or alternate request was attempted.

### Grok

- Started: `2026-07-18T18:02:44Z`
- Finished: `2026-07-18T18:03:19Z`
- requestId: `req_594187a7-ba3e-4f53-8c76-745625d78b0d`
- HTTP: `200`
- elapsed: `35.6s`

Request body:

```json
{
  "prompt": "Full-body illustration of the referenced character standing at a quiet city bus stop at golden hour, facing the camera with a relaxed smile, wearing the character original outfit, clean background, no text.",
  "elementIds": ["a_01KXQZXJSWEERY7A2PT5WXQ1V7"],
  "provider": "grok",
  "n": 1,
  "webSearchEnabled": false,
  "size": "1024x1024"
}
```

Response metadata (inline base64 image and provider result URL omitted; full revised prompt and
usage are preserved in `results/grok/sidecar-sanitized.json`):

```json
{
  "elapsed": 35.6,
  "filename": "1784397799946_9f8d875a_0.jpeg",
  "requestId": "req_594187a7-ba3e-4f53-8c76-745625d78b0d",
  "createdAt": 1784397799946,
  "usage": {"grok_cost_usd_ticks": 500000000},
  "provider": "grok",
  "reasoningEffort": "none",
  "webSearchCalls": 1,
  "quality": "medium",
  "size": "1024x1024",
  "moderation": "low",
  "model": "grok-imagine-image-quality",
  "warnings": [],
  "promptMode": "auto",
  "webSearchEnabled": true
}
```

Contract anomaly: the request explicitly set `webSearchEnabled:false`, but the response and sidecar
record `webSearchEnabled:true` and `webSearchCalls:1`.

## History and sidecar findings

### Raw prompt / notes leakage

- OAuth and Grok sidecars store `prompt` and `userPrompt` exactly equal to the fixed raw prompt.
- `/api/history?limit=100` returns the same exact raw `prompt` and `userPrompt` for both files.
- The selected element currently has `notes:null`; no notes fragment appears in either history or sidecar.
- Result: **PASS for raw-prompt preservation / no notes leakage**.

### Refs and warnings

- OAuth sidecar: `elementIds` contains the selected ID, but `refsCount:0`.
- Grok sidecar: `elementIds` contains the selected ID, but `refsCount:0`.
- `/api/history` independently reports `refsCount:0` for both successful files.
- Neither response/sidecar contains `droppedRefs`; response `warnings` is `[]`.
- Expected refs were 2 for both providers. The silent 2 → 0 mismatch is **FAIL** even though no
  provider capacity limit was exceeded.
- Gemini produced no history record or sidecar because it failed before generation.

## Drift observations

The two fixture refs already vary in rendering style and outfit silhouette, but consistently retain
long dark-brown hair, youthful facial proportions, predominantly black sportswear, and OpenAI-knot
marks. Neither successful output preserves that identity cluster.

### OAuth — major face drift, major outfit drift

- Face: realistic young woman with long dark hair, but eye/nose/mouth proportions and rendering style
  differ substantially from both refs; hair color/length are the only broad retained traits.
- Outfit: beige zip hoodie, white tank, wide blue jeans, and black shoulder bag. This replaces the
  black logo hoodie/shorts or black crop-top/track-pants fixture outfits and removes all marks.

### Grok — major face drift, major outfit drift

- Face: older-looking fair-skinned woman with short red wavy hair; age, hairline, hair color/length,
  eye/nose/mouth proportions, and overall identity all diverge.
- Outfit: black leather biker jacket, graphic tee, cargo trousers, purple bag, and combat boots. This
  does not preserve either fixture silhouette or its marks.

### Cross-provider

OAuth and Grok do not depict the same character: long dark-haired young woman versus short red-haired
older woman, with unrelated casual and biker outfits. Gemini has no image to compare. The visual
major drift is consistent with the stored `refsCount:0` evidence.

## Evidence index

- `element-fixture.json` — fixed input contract
- `inputs/front.png`, `inputs/different-pose.png` — copied fixture refs
- `results/gpt-oauth/1784397747084_93f6fc88_0.png` — OAuth original
- `results/gpt-oauth/sidecar-sanitized.json` — OAuth response/sidecar evidence
- `results/gemini-api/error-response.json` — complete Gemini failure response
- `results/grok/1784397799946_9f8d875a_0.jpeg` — Grok original
- `results/grok/sidecar-sanitized.json` — Grok response/sidecar evidence
- `070-drift-comparison.png` — refs, both successful outputs, and Gemini blocker side by side
