# Modération Géo — Simplification PRD

**Date:** 2026-04-27
**Branch:** `claude/simplify-admin-workflow-CeEdS`
**Owner:** Admin tooling
**Status:** Phase 1 in progress

---

## Problem

The admin "Modération Géo" page (`/fr/admin?tab=geo`) is hard to use:

- Two stacked tab bars (outer `Acquisition / Géo / Signalements`, then inner `Épingles / Cartes / Jeux`).
- Inner tabs are organised by **entity** (Pins / Maps / Games), not by **task**.
- Default landing state opens on `collecting` candidates — work that is *not yet ready* for human action.
- A "Comment cette page fonctionne" 3-step explainer is shipped to compensate for the unintuitive IA — itself a tell.
- Header counters ("12/45 cartes", "0 épingles", "232 erreurs") are alarming but inert: they surface problems without routing to the fix.
- Schema words leak into the UI: "Promus / Rétrograder / Méta" describe row mutations rather than admin intent.
- Promoting a candidate dumps the admin back to the top of the list with no auto-advance.

## Goal

The page should answer one question on load:
**"Is tomorrow's daily Géo challenge ready to ship — and if not, what do I need to do right now?"**

## Success metrics

- Median time-to-decide per candidate < 8 s.
- ≥ 85 % of admin Géo sessions touch only the default queue (no tab switches).
- Help panel can be removed in Phase 3 without complaints.

---

## Scope

### Phase 1 — Quick wins (S, ≤ 1 day, no structural risk)

Ship in `claude/simplify-admin-workflow-CeEdS`.

1. **Default `statusFilter` to `pending`** (`GeoReviewPanel.tsx:157`). Admins land on actionable work, not noise.
2. **Hide the "Comment cette page fonctionne" panel behind a `?` icon button.** Same content, surfaced via a Dialog, no longer occupying the top of the flow.
3. **Make header counters interactive** (`GeoHeaderStrip.tsx`):
   - `maps` counter → switch to `maps` tab.
   - `pins` counter → switch to `pins` tab with `statusFilter = 'pending'`.
   - `errors` counter → open a Popover listing recent failures from `health.failures`.
   - `nextChallenge` stays inert (info only).
4. **"Promote & next" auto-advance.** After a successful override/promote, automatically open the next pending candidate in the list. If the list is exhausted, return to the empty "pick one" state. Preserve scroll position in the candidate list.

**Out of scope for Phase 1:** label renames, restructure, removing tabs, removing the "Planifier" button.

### Phase 2 — Vocabulary cleanup (M, 1–2 days)

Rename schema-leaking terms to admin-facing words. Final rename table is in the appendix. Highlights:

| Concept | Old FR | New FR | Old EN | New EN |
|---|---|---|---|---|
| Candidate / Pin (unified) | Candidat / Épingle | Proposition | Candidate / Pin | Submission |
| Meta (canonical) | Méta | Lieu officiel | Meta | Official location |
| Promote (verb) | Promouvoir | Officialiser | Promote | Make official |
| Demote (verb) | Rétrograder | Retirer du lieu officiel | Demote | Remove from official |
| Reject (verb) | Rejeter | Refuser | Reject | Decline |
| Status `pending` | En attente | À modérer | Pending | Awaiting review |
| Status `promoted` | Promus | Officialisé | Promoted | Made official |
| Tab: Pins | Épingles | Propositions | Pins | Submissions |

Also: replace 4-chip status row + game badge with a unified queue header. Add new i18n keys alongside old, migrate components, then delete old keys in a follow-up.

### Phase 3 — Restructure (M–L, 3–5 days, only if Phase 1+2 don't fix it)

- Collapse to **2 inner tabs**: *À examiner* (today's queue, default) + *Catalogue* (Jeux + Cartes merged — both are reference data).
- "Planifier" + run state + errors fold into a single "État du pipeline" strip with a clear *Ready / Not ready for {date}* banner at the top.
- `viewCapturesForGame` teleport (`GeoReviewPanel.tsx:250-254`) becomes a simple game filter on the queue.
- `useGeoRunPolling` and `useGeoHealth` move behind a route-level visibility guard if the panel is split into routes.

---

## Implementation notes

- **Source of truth for copy:** `packages/frontend/public/locales/fr/translation.json` under `admin.geo.*`. Mirror EN in the same commit.
- **No backend changes for Phase 1 or Phase 2.** Existing endpoints (`GET /api/admin/geo/candidates`, `POST .../override`, `POST .../reject`, `DELETE /api/admin/geo/meta/:id`, `POST /api/admin/geo/schedule`) are tab-agnostic.
- **Rename strategy:** add new keys, migrate components, delete old in a follow-up commit. Never rename a key in place — Crowdin/PR diff noise hides regressions.
- **Status badge fallback** (`GeoReviewPanel.tsx:296-302`) returns the raw status when no key exists — make sure renamed status values either have a key or never reach the UI.

## Risks

- `viewCapturesForGame` teleport hides state across tabs; restructure must replicate or admins lose game-scoped filters silently.
- The candidate refetch effect (`GeoReviewPanel.tsx:204-217`) keys only on `[statusFilter, gameFilter?.gameId]`, not `activeTab`; switching tabs leaves stale data for ~1 frame. Phase 1 doesn't introduce a new tab, but Phase 3 will.
- `useIsMobile()` switches between bottom sheet and side card while sharing `pin` state; resizing across the breakpoint mid-edit drops the pin silently.
- I18n keys: ~132 references across the three Geo files. Renames need a `grep -rn "admin\\.geo\\." packages/frontend/src` audit per commit.

## Out of scope

- Automating the "Planifier" cron (PM persona suggested it; cleaner as a separate worker change).
- Splitting the JobQueuePanel out of admin (errors counter Popover is a smaller move).
- Mobile-only redesign of the Géo page.

---

## Appendix A — Full rename table (Phase 2 source of truth)

| Concept | Old FR | New FR | Old EN | New EN | Why |
|---|---|---|---|---|---|
| Candidate (entity) | Candidat | Proposition | Candidate | Submission | "Candidat" implies a person; these are user-submitted location proposals. |
| Community pin | Épingle | Proposition | Pin | Submission | Unify with Candidate; "épingle" was overloaded with the map marker visual. |
| Canonical pin | Méta | Lieu officiel | Meta | Official location | "Méta" is jargon; "lieu officiel" reads on first contact for moderators. |
| Status: collecting | En collecte | Ouvert aux propositions | Collecting | Open for submissions | Active voice; says what the moderator can do. |
| Status: pending | En attente | À modérer | Pending | Awaiting review | Calls the moderator to action. |
| Status: promoted | Promu | Officialisé | Promoted | Made official | Matches "Lieu officiel". |
| Status: rejected | Rejeté | Refusé | Rejected | Declined | Softer FR register, consistent with moderation tone. |
| Status: archived | Archivé | Archivé | Archived | Archived | Already clear. |
| Verb: promote | Promouvoir | Officialiser | Promote | Make official | Same root as the status. |
| Verb: demote | Rétrograder | Retirer du lieu officiel | Demote | Remove from official | "Rétrograder" feels punitive. |
| Verb: reject | Rejeter | Refuser | Reject | Decline | Mirrors status. |
| Tab: Pins | Épingles | Propositions | Pins | Submissions | Unified entity name. |
| Tab: Maps | Cartes | Cartes | Maps | Maps | Keep. |
| Tab: Games | Jeux | Jeux | Games | Games | Keep. |
| Counter: cartes | cartes | cartes couvertes | maps | maps covered | Disambiguates from Maps tab count. |
| Counter: épingles | épingles | propositions reçues | pins | submissions received | Unified naming. |
| Counter: erreurs | erreurs | signalements | errors | reports | "Erreurs" implied bug; these are user reports. |
| Counter: prochain | prochain | prochaine purge | next | next purge | "Prochain" alone was contextless. |
| Help section | Comment cette page fonctionne | Guide de modération | How this page works | Moderation guide | Reads as a reusable doc title, not a tooltip. |

## Appendix B — Translation key migration plan

Under `admin.geo.*`:

- **Copy-only changes** (keep the keys): `statusBadge.{collecting|pending|promoted|rejected|archived}`, `statusFilter.*`, `gameFilter.*`.
- **Structural renames** (new key, retire old):
  - `candidateRow.*` → `submissionRow.*`
  - `rejectDialog.*` → `declineDialog.*`
  - `demoteDialog.*` → `removeOfficialDialog.*`
  - `intro.*` → `guide.*`
  - `tabs.pins` → `tabs.submissions` (`tabs.maps`, `tabs.games` keep)
  - `strip.{maps|pins|errors|nextChallenge}` → `strip.{mapsCovered|submissionsReceived|reports|nextPurge}`
- **New keys**:
  - `entities.submission`, `entities.officialLocation` (used by tooltips, empty states, aria labels)
  - `actions.{makeOfficial|removeOfficial|decline}` (replacing `promote`, `demote`, `reject`)

## Appendix C — Risks before merging Phase 2

- **Status badge fallback** (`GeoReviewPanel.tsx:296-302`) resolves `admin.geo.statusBadge.${status}` from the DB enum. Status enum values stay (`collecting`, `pending`, `promoted`, `rejected`, `archived`) — only the translated *copy* changes. Do NOT rename the keys themselves or untranslated DB values will leak through.
- **E2E selectors**: Playwright specs likely use FR text like "Promouvoir", "Rejeter", "Candidat". Update locators in the same PR (`packages/frontend/e2e/admin-*.spec.ts`).
- **Backend log/audit strings**: `admin.service.ts` and worker logs may emit `"promoted candidate ..."`. Decide explicitly: leave logs alone, UI-only rename.
- **Wire/API names** (`candidate`, `pin`, `meta` in JSON responses and Socket events) stay unchanged this PR; rename is UI-only. Document so a follow-up PR can do the API rename behind a deprecation window.
- **EN/FR drift**: enforce that `fr/translation.json` and `en/translation.json` ship in the same commit; consider a CI check diffing key sets.

