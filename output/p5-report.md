# LivaSports P5 release report

Status: RELEASE QA IN PROGRESS — not yet production accepted.

- Production remains on baseline `98029d4ce1847a8dca389f0d2223e153ca094453` until release gates finish.
- Public identities: Betsson, Sportingbet BR, betboo BR. Hidden insurance: Betano BR.
- Quota/cadence model unchanged after approval: snapshot forecast 124/day average, 196/day peak against 273/day paced allowance; 54.6% average / 28.2% peak reserve. See quota report for assumptions.
- Migration 029 applied and rerun safely. Latest read-only audit 2026-09-21T08:41:10Z: 34 enabled competitions, 43,397 fixtures, 5,852 persisted quotes, zero duplicate/orphan quotes, zero active ingestion jobs.
- Budget at that audit: conservative period usage 1,613/5,000; rolling-day 171/273 (62.6%); UTC-day 38. Automatic headroom 47, controlled headroom 74. Production's existing scheduler can advance these values independently.
- Affiliate state: Betsson ACTIVE; Sportingbet/betboo NOT_APPLIED and disabled. No destination invented or activated.
- Final browser fixes: explicit visible estimated-source label for touch devices; mobile Match Center comparison groups avoid logo/odds collisions; homepage minimum odds targets corrected to 46x44px at 320px.
- Final full gates after visual fixes: 1,111 Vitest tests plus 17 validation tests; typecheck/lint/build/secret scan PASS. Diff whitespace check PASS. No environment or credential files are included.
- Browser QA: EN/PT-BR/ES-MX home, light/dark and 320/390/430/1440 measured without page overflow; narrow odds targets fixed and remeasured at 46x44px. Match Center odds targets measured at least 44px. Three-card slip comparison rendered, no card/dialog overflow, explicit proxy source labels. Automated 1/3/5/10-leg matrix covers REAL, Betano, alternate, mixed and incomplete states.
- Repository has no automatic test CI workflow; full test gates are local. Existing Vercel Git integration supplies deployment build status. No CI PASS is inferred from tests alone.
- Local Match Center sample: Betsson REAL; Sportingbet/betboo explicitly estimated from Betano. Three slip cards and no public Betano card verified. This is not yet new-source production ingestion evidence.
- Release, CI, final SHA, deployment ID, bounded new-source persistence and production acceptance: PENDING. Do not call P5 complete based on this interim report.
