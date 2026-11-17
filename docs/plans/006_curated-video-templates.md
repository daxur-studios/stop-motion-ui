---
type: Plan
title: "Curated video templates and daily development stories"
description: "Curate reusable social and desktop video treatments, then explore an evidence-backed daily development recap supplied by Æ."
status: planned
timestamp: 2026-11-15T00:00:00Z
tags: [engineering-records]
record: /docs/engineering-records/006_curated-video-templates.md
map_schema: 1
document_id: plan-006
initiative_id: "curated-video-templates"
performance: []
---

# Plan 006: Curated video templates and daily development stories

Status: **planned**. Evidence and decisions: [ER 006](/docs/engineering-records/006_curated-video-templates.md).

<!-- tri:scope -->

## Intended outcome

**TL;DR.** Build a small, recognisable set of video treatments that agents can reuse across projects. Start by showing the same real scenario as a vertical short and a desktop showcase. Now explore a narrated story of a development day across Codex, Claude and Antigravity, using evidence assembled by Æ rather than re-reading every transcript inside Stop Motion UI.

Bruno reviewed the two initial references as acceptable and chose to prioritize the daily development story. A recap renderer and cross-repository ingestion remain unimplemented.

## Template set

| Treatment | Intended viewing | Story structure |
| --- | --- | --- |
| Vertical short | Phone, 9:16 | Immediate visual hook → challenge → visible change → payoff; large captions and deliberate close views. |
| Desktop showcase | Laptop, 16:9 | Scene context → focused demonstration → inspectable result; room for useful controls and explanatory labels. |
| Before/after comparison | Either aspect ratio | Matched views or split screen; explain the change and show comparable evidence. |
| Daily development story (later) | Desktop recap with an optional short highlight cut | Outcome → selected chapters → parallel work and handovers → highlights and setbacks → what remains. |

For each curated treatment, retain a real reference export, editable recipe, typography, safe caption placement, camera/framing rules, pacing and an explicit audio policy. Silent, supplied speech and generated narration are choices; do not imply game/system audio is captured. Sound effects and music remain exploratory until mixing support and reusable asset rights are checked. Aspect ratios are creative targets here, not a claim of compliance with any current platform specification.

Share visual presentation through Stop Motion UI's existing recipe/export path. Applications own their actions, cameras, readiness and assertions; avoid copying capture machinery or hard-coding BSP terrain behaviour into the package. Extract only presentation repeated by the reference recipes. A green focus rectangle may identify a subject; it is not a verification result. A pass badge requires the corresponding scoped check to pass, and human visual acceptance stays separate.

## Current focus: a development day

Bruno wants a coherent story across simultaneous sessions, providers, repositories and handovers: what was attempted, what changed, what worked, what failed, useful highlights/shoutouts, optional lessons, and usage where available. This should feel like a short documentary of meaningful progress, not a transcript slideshow or a count of commits.

**Proposed ownership:** Æ owns read-only discovery, session associations, Git evidence and any bounded analysis. Stop Motion UI consumes a portable story brief plus selected media and renders chapters, narration, captions and timelines. Existing Æ session registry and repo docs remain sources of truth; Stop Motion UI does not build a competing session store. This is an integration direction to validate, not an assertion that an Æ export API exists today.

Start with a small curated fixture before a live adapter. Proposed brief fields (not a frozen API):

- Day/timezone and scope; selected repositories and story title.
- Chapters with outcome, source references, event times, selected clips/stills and optional narration.
- Session identities, harness/provider/model when known, confirmed or uncertain handover links, and overlapping activity intervals.
- Git commit/file references and captured dirty-work evidence, with attribution confidence. A commit date or shared directory alone does not prove which session did the work; one change may involve several sessions.
- Measured usage with source, interval, unit and coverage: input/output/cache tokens, provider-reported cost where available, or an explicitly labelled estimate with pricing basis. Missing values are unknown, not zero. Normalise only compatible categories, deduplicate cumulative snapshots and mirrored sessions, and keep reported cost distinct from estimates. Subscription usage does not imply a known marginal dollar cost.
- Evidence status and omissions. Hook/status intervals are observed activity, not proof of continuous work. Overlapping session time is not summed into elapsed day length. Distinguish wall time, observed activity and model usage.

Use verified native identities when available. Unknown session associations and inferred handovers remain visible. Do not invent chronology, causality, collaboration, success or spoken quotes to make the story smoother. Include unfinished/uncommitted work where supported by captured evidence; Git history alone cannot recover everything that happened. Separate recorded footage, reconstructed walkthroughs and illustrative timeline cards.

**Bounded analysis:** deterministic selection/grouping first; optional cheap-model analysis of compact chapter candidates, evidence and focused Git changes next. Cache by source hashes and analyser version. Set per-run input/output, cost and time caps before invoking a model; no automatic escalation or recursive transcript scans. Preserve a manual/no-AI path. Store provenance with the script, let Bruno correct chapter selection and narration, and inspect a representative day before judging analysis quality.

**Private and public versions:** local recap may contain private details; public cut uses explicit selected inputs and redaction of secrets, paths, customer information and private conversation. Shoutouts use approved display names. Rendering is separate from publishing; no automatic social posting. Do not send full native transcripts to an external model by default. Provider-specific permissions and availability need checking before a live adapter.

## Scope boundaries

- First delivery: curated vertical and desktop references using the same scenario, followed by a small reusable presentation layer where justified.
- Subsequent delivery: matched comparison treatment; later a fixture-driven daily recap and only then a small Æ adapter proposal/pilot.
- Not included now: a template marketplace, a full editor, an analytics dashboard, billing reconciliation, always-on screen capture, provider transcript ingestion in this repo, scheduled daily jobs or automatic publishing.
- Use existing narration and encoding facilities. No new paid model calls or audio generation are needed for this planning work.

## Phases and acceptance

- **reference-pair** — [ ] Curate vertical and desktop treatments of one real scenario (BSP Volcano Freight is the available seed). Acceptance: two playable exports, readable first/result frames, explicit audio choice, reproducible commands and owner feedback on framing/pacing. No need to rerun the simulation for layout-only edits if existing assets suffice; recapture when the view actually needs changing.
- **reusable-presentation** — [ ] Extract only the shared styling/structure and document agent adoption. Acceptance: a second scenario uses the templates without copied recorder code; caption overflow, missing media and aspect-ratio bounds have targeted checks; optional narration remains synchronised.
- **comparison-treatment** — [ ] Add a before/after reference. Acceptance: comparable conditions and units, labelled differences, matched camera/time or an explicit mismatch disclosure; unsupported improvement claims are rejected.
- **daily-story-fixture** — [ ] Prototype a recap from a curated brief, in parallel with evidence and compatibility planning in Æ. Acceptance: fixture covers parallel sessions, a cross-provider handover, missing usage, a failed attempt and later fix, and one change referenced by multiple sessions without double counting. The rendered story has evidence-linked chapters, an accurate overlap graphic, an explicit unknown-usage label and editable narration; owner judges whether it is interesting and accurate.
- **ae-integration-pilot** — [ ] At Bruno's explicit request, try a curated real-day video now alongside fixture work, before completing automatic ingestion. Acceptance: approved source scope, no native session writes, bounded analysis with recorded model use, traceable claims, explicit omissions, local reproducible export and owner review before any public use. Redaction/public approval remains separate. Record Æ implementation work in its own appropriate plan/ER rather than silently expanding this repository's remit.

## Relationships

- [Plan 005: reusable continuous recipes](005_reusable-continuous-video.md): capture, timing and narration foundation; this initiative adds curation and storytelling.
- [Plan 003: agent video workflow](003_agent-video-demo-workflow.md): installed consumer workflow and delivery.
- [Plan 002: testing video workflows](002_testing-video-workflows.md): testing evidence remains distinct from presentation and human acceptance.
- [Æ Recent work plan](../../../brunos-iae/docs/plans/014_recent-work.md) and [session contract](../../../brunos-iae/docs/sessions/README.md): existing cross-provider discovery and provenance boundary. These sibling-repository links require the local workspace layout.
- BSP seed recipe: `D:/code/brunos-space-program/tools/volcano-freight.video.mjs`; the existing 24-second silent pilot received positive format feedback. That feedback does not validate new templates.
<!-- /tri:scope -->

## Current phase status

| Phase    | State   |
| -------- | ------- |
| reference-pair | planned |
| reusable-presentation | planned |
| comparison-treatment | planned |
| daily-story-fixture | in_progress |
| ae-integration-pilot | in_progress |

Bruno reviewed the reference pair as acceptable, then explicitly requested a real-day video to judge the outcome before more architecture. The curated pilot now proceeds alongside fixture work; automatic collection and storyteller orchestration remain open.

<!-- tri:review version="1" scope-hash="936d2ac52e5f4177e58ffa18f600f30173a26653c28f0986b2a1ddf5e08a8800" reviewed="2026-11-16" reviewer="agent" -->
<!-- tri:item id="Q1" kind="intent" applies-to="ae-integration-pilot" blocks="ae-integration-pilot" state="open" -->

- [ ] Can one real day provide enough attributable changes, timing and usage for an accurate story?
  - Why it matters: provider coverage and shared-tree attribution may be incomplete; a polished video must not disguise this.
  - Next action: inspect a small owner-selected sample during the fixture phase, record field coverage and unknowns, then decide the minimal Æ export contract. This does not block the first template pair.
    <!-- /tri:item -->
    <!-- /tri:review -->

## Daily story: candidate visual treatments

Start with one 60–90 second desktop recap built from an editable synthetic brief, then test whether a short vertical highlight is useful. Candidate reusable scenes: opening outcome; chapter cards; a timeline of observed session events and confirmed handovers (gaps labelled, no fabricated continuous bars); a change card tying a result to selected evidence; an optional success/setback/lesson card; and an honest coverage/usage card showing unknown values. Use selected recorded footage when available, otherwise clearly labelled illustrative or reconstructed graphics. A quiet narration track and captions can be added from an approved editable script; audio has not yet been generated for this concept.

Æ [Plan 021](../../../brunos-iae/docs/plans/021_provider-session-evidence.md) covers the bounded evidence, optional cheap-model summary and provider compatibility-testing area. Its early metadata survey was not a complete activity count. The 2026-11-16 pilot subsequently confirmed dated messages in 62 deduplicated sessions for Sunday 15 November, including consultations and smoke tests, from bounded recent transcript tails. An initial 84.917-second narrated video now exists using the shared contract and `examples/day-story.video.mjs`. It has timeline endpoints and two recorded excerpts. This is current-agent curation with local scripts, not automatic Luna orchestration; coverage/usage and owner acceptance remain open.

## Reference pair for review

The existing silent portrait pilot and a new silent landscape capture use the same BSP Volcano Freight scenario. Both recipes live in `D:/code/brunos-space-program/tools/volcano-freight.video.mjs`; the desktop treatment places text on the left and leaves room for the route and rover. Both show the vehicle grade change, one delivery and the measured energy. The rover movement is simulated, not a physics demonstration.

From the BSP root, with its app and the installed Stop Motion UI 0.3.0 package available:

```powershell
$env:FREIGHT_FORMAT = 'desktop' # remove this variable for the 9:16 version
node D:/code/stop-motion-ui/bin/stop-motion-ui.mjs run tools/volcano-freight.video.mjs --out artifacts/videos/volcano-freight --codec h264 --narration off --timeout-ms 120000 --json
```

`Remove-Item Env:FREIGHT_FORMAT` selects the vertical default. Outputs are local, regenerable artifacts: desktop `D:/code/brunos-space-program/artifacts/volcano-freight-templates/run-bX8ElN/demo.mp4`; the earlier vertical reference is `D:/code/brunos-space-program/ignore/rover-short/run-mh2nr5/demo.mp4`. Capture records browser imagery only and uses no audio. The source frames for these two old runs were removed to reclaim space; the videos remain playable but those particular scenarios cannot be rerendered. The source-checkout CLI removes continuous source frames after a successful run unless `--keep-source` is specified; the previously installed 0.3.0 archive still has the old retention behavior until refreshed. Desktop gameplay checks passed; a contact sheet was inspected. Owner feedback on framing and pacing, especially desktop readability at laptop size, is still needed before accepting this phase. Shared presentation extraction remains a later phase.

## Delivery progress

2026-11-16: At Bruno's request, produced a real-day film for Sunday 15 November using the shared Æ contract, bounded conversation evidence, local narration and existing footage. Initial render exposed a 2.170 ms capture end-time gap; source finalization is fixed and the retained footage rendered successfully. Video is 84.917 seconds / 3,054,137 bytes, H.264/AAC. Contact sheet and selected full frames inspected; owner review, automatic daily collection and production storyteller integration remain open. See ER 006 for the local paths and regeneration command.

2026-11-15: Bruno watched the reference pair, found them acceptable and chose the daily story as the priority. Candidate scenes and Æ Plan 021 are recorded above. The two runs' source frames were removed to reclaim disk space; their videos are retained.

2026-11-15: Plan and ER created at Bruno's request. Existing recipe workflow and Æ registry documentation inspected. No new template, recap, provider adapter or AI analysis implemented or run.

Scope history in the Engineering Record is append-only. Confirm a specific baseline only after
explicit developer confirmation; document review and checked boxes do not imply confirmation.
