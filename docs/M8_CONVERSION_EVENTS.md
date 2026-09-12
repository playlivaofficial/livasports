# M8 conversion boundary

**POSTBACK_OPERATIONAL = NO. SUBID_PROPAGATION_OPERATIONAL = NO.**

No approved Betsson postback/API/export specification, signature rules, parameter documentation or credentials were found in the local configuration or existing project. The user's revenue-share relationship is recognized; it does not establish a technical postback contract. No affiliate dashboard was scraped.

`OperatorConversionEvidence` defines future verified registration, FTD, qualified FTD and revenue-event evidence. `affiliate_conversion_events` supports authoritative operator event identity, bookmaker, optional first-party click reference, occurrence/receipt timestamps, source and verification references, currency and operator-reported revenue/commission. `(bookmaker_id, operator_event_id)` is unique. Click deletion removes attribution linkage after retention; it does not manufacture a conversion.

The receiver boundary is deliberately disabled: `/api/affiliate/postback/<bookmaker>` returns 404 for GET/POST and never accepts claims. The adapter throws `POSTBACK_NOT_CONFIGURED`. No synthetic conversion, NGR, revenue or commission row is seeded. A redirect, cookie, elapsed time or returning browser never means registration or deposit.

Activation requires the actual approved operator integration documentation and securely configured credentials, followed by signature/authentication, replay/idempotency, amount/currency and canonical click reconciliation tests. No parameter such as `subid`, `btag` or `clickid` is assumed. Approved tracked URLs are preserved exactly without adding arbitrary tracking parameters. Current measurement ends at eligible first-party impressions and issued redirects.
