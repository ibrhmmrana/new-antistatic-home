# Persisted Shareable Report — Internal Test Plan

## 1) Normal flow: landing → /report/[scanId] → verify → analyses → report

- **Steps:** Go to landing, search business, select place, click "Analyse my business". Complete email verification and social usernames. Wait for onboarding stages and analyses to complete.
- **Expect:** Report assembles and renders. Persist API is called once. URL changes to `/r/[reportId]` (router.replace). No duplicate persist calls.

## 2) Share link in incognito: /r/[reportId]

- **Steps:** Copy the `/r/[reportId]` URL from (1). Open in an incognito (or different browser) window.
- **Expect:** Report renders from DB only. No analysis API requests (no `/api/scan/search-visibility`, `/api/places/reviews`, `/api/ai/analyze`, etc.). No localStorage read. Page is purely presentational.

## 3) Old scan URL in incognito: /report/[scanId]/analysis?placeId=...&name=...&addr=...

- **Steps:** Open the old `/report/[scanId]/analysis?...` URL (same scanId as in (1)) in incognito.
- **Expect:** Client calls `GET /api/public/reports/by-scan?scanId=...`. Response 200 with `reportId`. Page redirects to `/r/[reportId]`. No analysis rerun, no localStorage usage.

## 4) DB payload size and no base64

- **Steps:** After (1), inspect `analysis_reports` row for that report (e.g. in Supabase dashboard). Check `report_payload` and `source_payload`.
- **Expect:** No `data:image/...` base64 strings in JSON. Payload size is reasonable (no multi‑MB blobs). Screenshot-like fields are null or URLs only.

## 5) No private data on /r route

- **Steps:** Load `/r/[reportId]` and inspect response / DOM / network.
- **Expect:** No email, no verification tokens, no internal challenge IDs in the response or visible in the page. Only public report content (business name, scores, checklist, etc.) is exposed.

---

## Quick checklist

- [ ] Normal flow: report appears → persist → URL becomes /r/[reportId]
- [ ] Incognito /r/[reportId]: report loads, zero analysis requests
- [ ] Incognito /report/[scanId]/analysis: redirects to /r/[reportId], no rerun
- [ ] DB: no base64 in report_payload/source_payload; size reasonable
- [ ] /r page: no private email or tokens exposed
