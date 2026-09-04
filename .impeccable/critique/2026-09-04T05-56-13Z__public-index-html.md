---
target: homepage start page
total_score: 28
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
timestamp: 2026-09-04T05-56-13Z
slug: public-index-html
---
# Critique — public/index.html (homepage start page)

Method: dual-agent (A: AssessDesignReview · B: AssessDetectorEvidence). All 10 heuristics scored; max 40.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---|-------|-----------|
| 1 | Visibility of System Status | 3 | Sync errors have no retry action; completion advance not summarized on stage |
| 2 | Match System / Real World | 3 | Bangs, `2p`, shortcuts, "ground/Colour" need product-specific knowledge |
| 3 | User Control and Freedom | 3 | Task deletion has no undo; completion silently advances current task |
| 4 | Consistency and Standards | 3 | Icon-only docks + hover-only titles depart from visible-label norms |
| 5 | Error Prevention | 3 | Validation + snapshots good; immediate delete, no save/undo affordance |
| 6 | Recognition Rather Than Recall | 2 | Docks SVG-only; `?` undiscoverable; double-click-to-edit hidden |
| 7 | Flexibility and Efficiency of Use | 3 | Excellent expert path once learned; Home→Pomodoro transition adds friction |
| 8 | Aesthetic and Minimalist Design | 4 | — |
| 9 | Error Recovery | 2 | "Sync failed" names no action; media fallback path unclear |
| 10 | Help and Documentation | 2 | Empty states offer no next action; help not contextual for first run |
| **Total** | | **28/40** | **Good foundation; discovery, recovery, first-run need attention** |

## Design Specificity Verdict

**LLM assessment:** Strongly authored but the default state hides its POV (7.5/10). The hour-driven mesh, glass language, one-panel model, local commands, and timer cycle are product-specific — but every new tab opens on Home (search + empty favorites + generic docks), which any new-tab product could wear unchanged. Character is gated behind state and prior knowledge.

**Deterministic scan:** `detect.mjs --json public/index.html` returned zero findings on the markup (note: parser modules unavailable, regex fallback — weak clean, not proof). The stronger signal is the earlier full scan (69 CSS findings, all triaged as documented intent). The detector caught nothing the review found: the live issues (discovery, empty states, sync recovery) are judgment issues, not pattern violations.

**Visual evidence (no overlay):** No script injection was attempted, so no user-visible overlay exists. Evidence is headless screenshots: desktop Home + Pomodoro/Tasks, 390px mobile, forced-colors — body fits viewport exactly everywhere, zero JS errors, plates corroborate the measured contrast floor (tabs .026–.056, clock .14–.164).

## Overall Impression

The world is coherent and the timer peak is genuinely good; the product's quietness curdles into dead ends exactly where a new or unlucky owner needs one tap of guidance — first run, empty states, sync failure. Biggest opportunity: make every dead-end state answer its own next question.

## What's Working

1. **An ownable visual world, faithfully realized.** Hour-aware mesh, white type, dark glass, no competing accents — memorable without becoming a feed.
2. **Timer composition when exposed.** Giant tabular readout, three modes, dots, single Start — a clean priority stack at the true viewport centre.
3. **Threshold-respecting architecture.** One panel shell, deferred embeds, local font, CSS-only mesh. Instant-over-rich holds.

## Priority Issues

**[P1] Default Home hides the timer-first differentiator.** Every glance starts in the most interchangeable state; the core promise needs a tiny tab, a click, or a known key. Counterweight: Home-first is a deliberate product decision (stage.js: always opens Start; PRODUCT.md threshold + type-and-go). This needs an owner call, not an automatic redesign.

**[P1] Empty states route to hidden places.** "No sites yet — add up to 8 in Settings" (no action), "No task selected" (no action). First run decodes gear → section → add-row. Fix: contextual actions ("Add a site", "Choose a task") inside the empty states; no tour, keep one-panel rule.

**[P1] "Sync failed" is an alarm without a recovery contract.** Non-interactive span, background retry, no Retry / "saved locally" distinction. (Seen in screenshots partly because the capture harness is offline — but the missing affordance is real regardless.) Fix: compact keyboard-accessible detail/retry in the dock footprint.

**[P2] Discovery leans on memory and hover.** SVG-only docks, `?` behind Escape-then-key, double-click editing; 34px docks/26px close under the 44px guideline (24px AA minimum met). Fix: first-run/touch affordance + larger hit boxes, icons visually unchanged.

## Persona Red Flags

- **Owner across phone+laptop:** per-device timer locality is nowhere stated — mid-session switch reads as failed sync. Sync text gives no way to verify the other device got the edit.
- **Keyboard focuser:** Escape-then-`?` undiscoverable; `space` silently stage-switches; queue maintenance is mouse-only discovery.
- **First-run user:** gear icon must be inferred; nine-section Settings precedes the basic loop; starting without a task is neither blessed nor guided.

## Minor Observations

- Search focus shows a double ring (`:focus-visible` + input `:focus`) — accessible but the loudest thing on the quiet field.
- "No task selected" reads disabled though clickable; Settings "Done" implies a submit boundary over autosave fields; Colour's five phase labels are presentation terms; confetti layer deserves a low-height check.

## Questions to Consider

1. If this is timer-first, why does every tab begin with the timer absent — is Search the true default, or is the product avoiding its differentiator?
2. Can "No sites yet", "No task selected", and "Sync failed" each answer the next question in one tap without a tour?
3. After a laptop→phone switch mid-session, where does the interface state that the timer is deliberately local?
