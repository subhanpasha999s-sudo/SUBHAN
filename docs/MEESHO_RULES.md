# MEESHO_RULES — the crown jewels (behavior is LAW)

> Exhaustive documentation of the existing Meesho order-import and
> payment-reconciliation behavior, as found in the code on 2026-07-02.
> **Changing anything here — including accepted file formats — requires
> explicit operator approval** (spec §2.3, §6).
>
> Pinned by tests: `src/book/lib/engine/meesho.rules.test.ts` (parser/dedupe/
> merge fixtures) and `src/book/lib/core/reconciliation.characterization.test.ts`
> (classification → GL → trial balance golden master). These must stay green in
> every phase. The sibling `../meeshoprofit` repo additionally has seed-based
> suites (`orderCounts`, `pnlReconcile`) and real-file scripts.

## 0. How data enters the app

There is **no Meesho API** (unavailable). Ingestion is **file upload**, parsed
entirely client-side, via `/book/integrations` ("smart file ingestion") or the
upload flow. Entry point: `decodeMeeshoFile(file)` in `src/book/lib/files.ts`.

**Content-based file detection (not extension):**
- `.csv` → order export → `parseOrderRows`.
- `.xlsx`/`.xls` → read workbook; if a sheet fuzzy-matches **"Order Payments"**
  → payment file; otherwise try each sheet as an order export (sellers save
  order files as XLSX too — extension-routing would misparse them to zero rows).
- Unrecognized → `ParseError` with a human message. Never silent.

**Idempotency layer 1 — file hash:** every accepted upload records a SHA hash in
`uploads[]`; re-uploading the exact same file is rejected with
"This exact file was already uploaded (same content hash)."

## 1. Order file (CSV, or XLSX fallback)

Parser: `parseOrderRows` (`engine/parse.ts`); headers via `mapOrderHeaders`.

- **Header row is scanned, never assumed**: Meesho prepends a drifting number of
  preamble rows ("Table 1", group banners). `findHeaderRow` scans the first 10
  rows for the one that resolves all `REQUIRED_ORDER_FIELDS` =
  `reason, subOrderNo, sku, quantity`. If none: ParseError naming the missing
  columns ("This doesn't look like a Meesho order file…").
- **Fuzzy header matching** (`headerMatcher.ts`): normalize (lowercase, strip
  punctuation except `%`, collapse spaces) → exact variant-table match in
  priority order → fallback `startsWith` match skipping already-claimed columns
  (Meesho appends qualifiers like "(Incl. GST)" over time). Known variants
  include Meesho's misspelling **"commision"** alongside "commission";
  new drift is handled by ADDING variants, never by editing normalization.
- Captured fields: reason (uppercased), subOrderNo, catalogId, orderDate,
  orderSource (non-blank ⇒ ad-attributed), customerState, productName, sku,
  size, quantity (default 1), listedPrice, discountedPrice, packetId
  (blank for cancelled orders).
- **Skip accounting is never silent** (`ParseReport`): blank Sub Order No rows
  count as `skippedNoKey`; they are banner/blank rows, not data.

### 1a. Canonical order identity (`canonicalizeOrders`, engine/classify.ts)
Multi-row Sub Order Nos collapse into ONE canonical order — counts are never
inflated. Merge rules (reason resolution):
- `DOOR_STEP_EXCHANGED` + `DELIVERED` → **DELIVERED** (exchange forward leg;
  payment decides the final class), with **`hadExchangeLeg=true`** preserved so
  the exchange signal survives the merge.
- `DELIVERED` + `CANCELLED` → **DELIVERED** (partial line cancellation).
- all rows `DOOR_STEP_EXCHANGED` → stays DOOR_STEP_EXCHANGED.
- otherwise: first non-CANCELLED reason, else the latest row's reason.
The latest-dated row provides the base fields. `ingestOrderFile` then keeps only
Sub Order Nos not already known, stamps `sourceFile` (enables per-file delete),
and rebuilds the inventory ledger + QC queue.

- **Sub Order No is ALWAYS a string** (`normalizeSubOrderNo`): 18-digit ids lose
  precision as numbers; whitespace trimmed; the `_1`/`_2` line-item suffix is
  PRESERVED exactly (it distinguishes lines of an order).

## 2. Payment file (XLSX workbook)

Sheets (fuzzy-matched by name): **"Order Payments"** (required), **"Ads Cost"**,
**"Referral Payments"** (both optional).

### 2a. Order Payments sheet (`parsePaymentRows`)
- Layout: row 0 section title, headers found by scan, and the row right after
  the headers is Meesho's **formula legend** ("A", "B + C", …) — it is skipped
  because its Final Settlement Amount is non-numeric. Rule: **a row with a
  Sub Order No but non-numeric settlement is dropped and counted**
  (`skippedBadValue`, surfaced as a warning); real payout rows always carry a
  numeric settlement. ₹, commas and spaces are stripped when testing numeric.
- `REQUIRED_PAYMENT_FIELDS` = `subOrderNo, finalSettlement`.
- Captured per row: transactionId, orderDate, dispatchDate, productName, sku,
  liveOrderStatus (normalized; **blank stays `null` — null is meaningful**),
  finalSettlement, quantity, totalSaleAmount, returnShippingCharge, **tcs**,
  **tds**, compensation, claims, recovery, paymentDate.
- Each row becomes an append-only **`PaymentEvent`** (`paymentRowToEvent`) with
  `eventDate = paymentDate || orderDate`, plus `monthBucket` (upload month) and
  `sourceFile`.

### 2b. Idempotency layer 2 — event dedupe (`eventDedupeKey`)
Real Meesho exports reuse ONE Transaction ID per **payout batch** (shared by
hundreds of orders), so Transaction ID alone is NOT a line key. The line key is
`subOrderNo | transactionId | finalSettlement(2dp) | liveOrderStatus`:
- re-importing the same file ⇒ identical keys ⇒ skipped (`duplicatesSkipped`);
- a later payout with a different Transaction ID for the same order ⇒ kept,
  even if the amount matches;
- `monthBucket` is EXCLUDED so the same line re-uploaded in a different month's
  file still dedupes.

### 2c. Ads Cost sheet
Same title/header/legend layout; "No data is available for these dates." ⇒ [].
Produces ONE auto expense per month (`ADS_AUTO` source, keyed by `sourceKey`,
updated in place on re-import — never duplicated). **Referral Payments** sheet
sums an amount-ish column (permissive header match) into referral income.

## 3. Reconciliation (matching + classification)

Grouping key: `subOrderNo` (exact string). `reconcileAll` (v2/derived.ts) builds
one `ReconciledOrder` per unique Sub Order No from Order Data, PLUS payment-only
records for events whose Sub Order No has no order row. **Order Data is the sole
source of truth for order counts** — payment-only records are never counted as
orders; they surface only as "unmatched/unacknowledged payouts".

### 3a. Event partitions
- **status events**: rows with a real Live Order Status — these drive the class.
- **blank + positive** settlement = claim / compensation income.
- **blank + negative** settlement = affiliate/platform fee deduction.

### 3b. Classifier (`classifyReconciled` — PAYMENT TRUTH WINS)
Order-file reason is only a hint; payment status events + settlement decide.
Decision order (first match wins):
1. **Payment-only** (no order row): blank-positive only ⇒ CLAIM; any events with
   net < 0 ⇒ PLATFORM_FEE; net > 0 ⇒ CLAIM; else UNKNOWN.
2. reason=CANCELLED and no delivered/shipped leg and net ≤ 0 ⇒ **CANCELLED**.
3. reason=LOST ⇒ **LOST** (order-file intent authoritative).
4. blank-positive events with no delivered leg ⇒ **CLAIM**.
5. **Exchange-then-return**: order had an exchange leg (literal "exchange"
   status, DOOR_STEP_EXCHANGED reason, or `hadExchangeLeg`) AND latest-dated
   status is Return ⇒ **RETURN** (the replacement came back too).
6. any "exchange" status (latest not return) ⇒ **EXCHANGE**; also
   DOOR_STEP_EXCHANGED reason with both Return and Delivered legs ⇒ EXCHANGE.
7. latest status delivered ⇒ DELIVERED; **shipped ⇒ sign decides** (net ≥ 0 ⇒
   DELIVERED — payment landed before status flipped; net < 0 ⇒ RETURN);
   return ⇒ RETURN; rto ⇒ RTO.
8. No confirming payment status: reason=RTO_COMPLETE ⇒ RTO; otherwise
   ⇒ **DELIVERED** (forward leg delivered, awaiting settlement).

### 3c. Lifecycle (`lifecycleOf`, settleAfterDays default 60)
- CANCELLED ⇒ SETTLED immediately (nothing owed — **never "awaiting"**).
- no events ⇒ AWAITING_PAYMENT.
- income-class (DELIVERED/EXCHANGE/LOST/CLAIM) with cumulative ≤ 0 ⇒
  PARTIALLY_SETTLED (expected money missing).
- last event ≥ settleAfterDays old ⇒ SETTLED, else PARTIALLY_SETTLED.
- manual `disputed` flag is sticky ⇒ DISPUTED.
- Event ordering: monthBucket, then paymentDate/eventDate, ties broken by
  status rank delivered(4) > return(3) > rto/exchange(2) > shipped(1).

### 3d. Reconciliation identity (oracle)
`reconciliationState` buckets every order into **matched + awaiting + closed**;
cancelled / RTO / return-with-no-events belong to **closed**, never awaiting.
(Historical oracle on the operator's real data: 374 matched / 379 awaiting /
114 closed — see memory + tests.)

### 3e. Returns / RTO / QC queue (`qcReturnTypesFor`)
- RTO ⇒ one RTO QC entry; RETURN ⇒ one CUSTOMER_RETURN; EXCHANGE ⇒ one
  EXCHANGE_RETURN.
- **Exchange-then-return ⇒ TWO entries** (CUSTOMER_RETURN + EXCHANGE_RETURN):
  both physical units come back and each gets its own QC pass — this is why a
  Delivered→Exchange→Return order counts as **2 customer returns** in the
  Returns breakdown.
- QC decision (SELLABLE restocks; DAMAGED/…) writes inventory ledger events;
  **MISMATCH auto-seeds a claim draft** (status RAISED, amountClaimed = current
  COGS) into the claims tracker.

### 3f. Upload application (`applyPaymentUpload`)
Pure function: dedupes incoming events, reports `ordersUpdated`,
`newSettlements` (settlement ≠ 0), `totalReceived` (sum of new positives), and
**reclassifications** (class before vs after per affected order). Ledger + QC
queue are rebuilt from full orders+events after every ingest.

## 4. Accounting projection (current GL rules)

`buildGlEntries` (v2/reportDerived.ts) derives the GL from state (COA in
`engine/accounting.ts`; codes: 1000 Cash, 1100 AR, 1200 Inventory, 1300 TDS
Receivable, 1400 TCS Receivable, 2000 AP, 4000 Sales, 4100 Exchange Income,
4200 Claims & Compensation, 4300 Lost Order Compensation, 5000 COGS, 5100
Return & RTO Losses, 6000 Platform & Affiliate Fees, 6100 Advertising, 6200 QC
Damage Write-offs, 6300 Operating):
- affiliate-fee event ⇒ DR 6000 / CR 1000.
- positive settlement ⇒ DR 1000 / CR revenue by class (Sales / Exchange /
  Claims / Lost-compensation); **TDS/TCS withheld ⇒ DR 1300/1400 / CR the same
  revenue account** (Cash = net received, Revenue = gross earned).
- negative settlement ⇒ DR 5100 / CR 1000.
- COGS recognized per order (DR 5000 / CR 1200) ONLY for income classes —
  never for CANCELLED/RTO/RETURN/PLATFORM_FEE/UNKNOWN.
- purchases: bill ⇒ DR 1200 / CR 2000; paid portion ⇒ DR 2000 / CR 1000
  (discrete BillPayments, else implicit for paid/partial bills).
- expenses ⇒ DR 6300 (or 6100 for ADS_AUTO) / CR 1000; categorized bank lines
  post via section 5 of the same builder.
These derived entries port 1:1 into the stored immutable ledger via
`glEntryToJournal` (`core/journal.ts`) with idempotency key `gl:<entry id>` —
parity proven by tests (pure + SQL level).

## 5. Other pinned behaviors
- Settlement status per order (`settlementStatusOf`): PAID / UNPAID / DISPUTED.
- Unmatched payouts view: payment-only Sub Order Nos with net totals, split
  affiliate-fee vs settlement.
- GST monthly summary (`gstForMonth`) + TCS tracked per order for returns prep.
- Per-file delete (`deleteUpload`) removes that file's orders/events and
  rebuilds; `clearImportedData` keeps SKUs/vendors/purchases/settings.
- Import summary numbers are file-scoped and reproducible: rowsRead, matched /
  unmatched (against known orders), fileReceived (sum of settlements).

## 6. Known intentional quirks (do not "fix" without approval)
- Exchange orders whose only payment row is a final Return still classify
  RETURN and still yield two QC entries (via `hadExchangeLeg`).
- Shipped with positive net counts as DELIVERED (data lag), negative as RETURN.
- The formula-legend row is detected by non-numeric settlement, not position.
- Duplicate order rows in `mergeFiles` keep the FIRST order row.
- Payment rows for unknown orders are kept (unacknowledged payouts), not dropped.
