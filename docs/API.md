# Tulmin Book — Public REST API v1

Read/write access to the stored double-entry ledger, scoped to one organization
by an API key. All money is `numeric` (2 dp); every amount is INR.

## Authentication
Create a key in **Team & settings → API keys** (shown once). Send it as a
bearer token:

```
Authorization: Bearer tul_live_xxxxxxxx…
```

Keys carry scopes: `read` (all GET) and `write` (POST). Only the SHA-256 hash is
stored; a leaked database never exposes usable keys. Revoke anytime.

Errors are JSON `{ "error": "…" }` with status:
`401` missing/invalid key · `403` missing scope · `422` validation/unbalanced ·
`5xx` backend.

Pagination: `?limit=` (default 100, max 500) and `?offset=`.

## Endpoints

### `GET /api/v1/accounts`
Chart of accounts.
```json
{ "data": [{ "code": "1000", "name": "Cash & Bank Receipts", "type": "asset", "creditNormal": false, "archived": false }], "limit": 100, "offset": 0, "count": 1 }
```

### `GET /api/v1/journal-entries`
Posted entries, newest first, with their lines.
```json
{ "data": [{ "id": "…", "entryDate": "2026-06-16", "memo": "…", "sourceType": "cogs", "status": "posted",
  "lines": [{ "accountCode": "5000", "accountName": "Cost of Goods Sold", "debit": 200, "credit": 0 }] }], "count": 1 }
```

### `POST /api/v1/journal-entries`  *(write scope)*
Posts a balanced entry through the same transactional RPC as the app
(DB-enforced balancing; idempotent on `externalId`).
```json
// request
{ "entryDate": "2026-06-20", "memo": "API sale", "sourceType": "manual",
  "externalId": "erp:inv:42",
  "lines": [{ "accountCode": "1000", "debit": 300 }, { "accountCode": "4000", "credit": 300 }] }
// 201
{ "id": "…" }
```
`422` if the entry is unbalanced, an account code is unknown/archived, or the
date falls in a closed period. Re-posting the same `externalId` returns the
existing entry id (no duplicate).

### `GET /api/v1/trial-balance[?asOf=YYYY-MM-DD]`
Per-account totals + grand totals (equal for a balanced ledger).
```json
{ "asOf": null, "rows": [{ "code": "1000", "name": "Cash & Bank Receipts", "type": "asset", "debit": 1300, "credit": 0, "balance": 1300 }],
  "totals": { "debit": 1500, "credit": 1500, "balanced": true } }
```

## Notes / limits
- Read routes use the org's stored ledger (populated by the app's *Sync from
  activity* or by API writes). Documents (invoices/bills) live in the app;
  their accounting effect appears here as journal entries.
- Webhooks are not yet available (no delivery queue in the current stack) —
  planned as a follow-up.
- Rate limiting is basic (per-request); heavy consumers should page with
  `limit`/`offset`.
