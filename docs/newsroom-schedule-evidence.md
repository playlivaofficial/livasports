# DIMAYOR schedule correction — 28 October 2026

The original notice-only contract omitted the official PDF and permitted an unsupported absence claim. The existing article was corrected through authenticated Save → Review → Publish, retaining its slug, original publication time and revision history. No AI call was needed for that factual correction.

## Evidence and operational boundary

The facts-only attachment manifest in `src/editorial/automation/schedule-attachments.ts` records the exact document URL, SHA-256, metadata version, both inspected pages, competition/round and all three dated fixtures. Team crests on the image-based second page were visually identified; no artwork is redistributed. Times are explicitly qualified as an interpretation of Colombia local time, not a timezone printed in the document.

This is not a general PDF/OCR extraction service. Only the fully inspected document with matching bytes qualifies. Unknown, changed, inaccessible, ambiguous or incomplete schedule attachments remain private before any model request. Adding another document requires equally complete evidence. This exception workflow does not require routine Owner approval for independently verified result/announcement classes.

The DIMAYOR collector checks robots, RSS, the canonical article and its article-scoped PDF, at most four requests. Footer regulation PDFs do not qualify as attachments. The live WordPress metadata heading is checked against its canonical URL. All three fixture/date/time/venue rows and the timezone qualification are mandatory in every generated language. Unsupported negative claims are rejected deterministically and by the independent editorial rubric.

## Continuous automation and correction safety

The global newsroom remains ACTIVE on its existing six-hour schedule. During remediation only DIMAYOR intake was disabled. After the fixed release, it can resume: schedule-specific completeness guards quarantine unsafe notices while unrelated approved contracts remain eligible. Existing budgets, leases, deduplication, archive protection and the five-model-call ceiling are unchanged.

A separately reviewed and published Owner correction takes precedence over the older automation revision. A newer private draft alone does not protect an obsolete public claim from normal withdrawal. Both behaviors retain audit history; no automatic rewrite or duplicate publication is introduced.

## Validation

- Actual official notice/PDF recheck passed with three free source reads and zero model calls; RSS selection was replayed specifically for this older notice, which is no longer among the three current discovery candidates.
- Synthetic PostgreSQL tests cover correction save/review/publish, date/source preservation, no duplicate, subsequent source changes and private attachment quarantine. Existing local publications and spending records remain unchanged.
- Attachment regressions cover image/unknown bytes, changed identity/version, missing rows, wrong associations, dates/times/venues, unsupported absence claims, HTTP failures, robots restrictions, oversized content and WordPress article boundaries.
- No production migration or infrastructure configuration change is required.
