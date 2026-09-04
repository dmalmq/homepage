---
name: Homepage
description: A quiet colour field with the timer standing in it.
colors:
  field-white: "#ffffff"
  field-soft: "rgb(255 255 255 / 0.74)"
  field-faint: "rgb(255 255 255 / 0.55)"
  inverted-ink: "#1b1035"
  signal-rose: "#ffc9d1"
  glass: "rgb(0 0 0 / 0.30)"
  glass-line: "rgb(255 255 255 / 0.16)"
  glass-hover: "rgb(255 255 255 / 0.14)"
  panel-deep: "rgb(18 12 34 / 0.72)"
  ground-dawn: "#3d2447"
  ground-day: "#1e3a7a"
  ground-dusk: "#371352"
  ground-night: "#140b30"
typography:
  display:
    fontFamily: "'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "clamp(84px, 15vw, 168px)"
    fontWeight: 700
    lineHeight: 0.92
    letterSpacing: "-0.045em"
  headline:
    fontFamily: "'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "clamp(28px, 2.2vw, 38px)"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.03em"
  title:
    fontFamily: "'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  body:
    fontFamily: "'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.01em"
rounded:
  pill: "999px"
  radius: "12px"
  panel: "16px"
  field: "8px"
  mini: "6px"
  row: "10px"
  tag: "5px"
components:
  button-primary:
    backgroundColor: "{colors.field-white}"
    textColor: "{colors.inverted-ink}"
    rounded: "{rounded.pill}"
    padding: "11px 24px"
  button-glass:
    backgroundColor: "{colors.glass}"
    textColor: "{colors.field-white}"
    rounded: "{rounded.pill}"
    padding: "11px 24px"
  search-field:
    backgroundColor: "{colors.glass}"
    textColor: "{colors.field-white}"
    rounded: "{rounded.pill}"
    padding: "12px 20px"
  panel-card:
    backgroundColor: "rgb(18 12 34 / 0.72)"
    textColor: "{colors.field-white}"
    rounded: "{rounded.panel}"
    padding: "14px 16px"
---

# Design System: Homepage

## Overview

**Creative North Star: "The Quiet Colour Field"**

A saturated gradient mesh is the page's one indulgence; everything else is white type and translucent dark glass, kept deliberately still so the timer never competes with anything. The mood is quiet, confident, and still — an instrument glanced at for half a second, not a feed to browse. Density is minimal at rest (timer, search, favorites, corners) with exactly one floating panel open at a time behind the dock.

The mesh tracks the real hour through four phases (dawn, day, dusk, night); geometry is shared, so a phase is only a ground plus four blob colours. White type over saturated colour is the standing legibility risk, carried entirely by the scrim — never by recolouring the type.

**Key Characteristics:**
- One saturated field; everything above it is white or glass.
- Timer-first hierarchy: the readout is an order of magnitude larger than anything else.
- Pill geometry for controls; 16px cards for floating layers.
- Springy, physical micro-motion on touch; the page itself never entrances in.
- Tabular numerals everywhere numbers appear.

## Colors

White type over a shifting saturated field, with darkness supplied by scrims and glass rather than by the type itself.

### Primary
- **Field White** (#ffffff): all type, icons, dots-done, and every filled-active surface (primary buttons, active mode, active tab, active dock button). Its rarity as a *fill* is the point — a filled white control is always the current state.
- **Quiet White** (rgb(255 255 255 / 0.74)): secondary copy — intention line, icon buttons at rest, dock buttons at rest.
- **Whisper White** (rgb(255 255 255 / 0.55)): tertiary copy — placeholders, empty states, key hints, clock-adjacent chrome.

### Neutral
- **Inverted Ink** (#1b1035): type on filled white controls only. The `theme-color` meta in `index.html` carries the same value by hand.
- **Glass** (rgb(0 0 0 / 0.30)): resting fill for buttons, search field, docks, and segmented tabs.
- **Glass Line** (rgb(255 255 255 / 0.16)): the single hairline for every bordered surface.
- **Glass Hover** (rgb(255 255 255 / 0.14)): hover wash over glass.
- **Signal Rose** (#ffc9d1): the one red for the error role — sync offline/error states and invalid input, nothing else.
- **Panel Deep** (rgb(18 12 34 / 0.72)): floating panel fill, always paired with 22px blur. Search suggestions use a denser sibling (rgb(22 13 43 / 0.94)).
- **Functional Blacks** (#160f2b PiP shell, #000 video letterbox): document-chrome blacks, not system tokens. The PiP window carries no `:root` tokens and video needs a true-black matte; neither may migrate onto the page.

### Mesh phases (the colour field)
Each phase is a ground plus four saturated blobs; geometry shared, cross-faded over 1.6s linear:
- **Dawn Ground** (#3d2447): blobs #ffa25c, #ff5f95, #8a6bff, #ffd08a.
- **Day Ground** (#1e3a7a): blobs #3d7bff, #35d6f5, #9b5cff, #46e8c0.
- **Dusk Ground** (#371352): blobs #ff2d6f, #d43cff, #3d5cff, #ff74ad.
- **Night Ground** (#140b30): blobs #4632c9, #8a3fd4, #1e46a8, #c04a92.

### Named Rules
**The One Field Rule.** The mesh is the only saturated fill on the page. Never add a competing accent hue, gradient, or coloured shadow outside it.
**The Scrim Carries Contrast Rule.** Bright-blob legibility is fixed in the scrim (top band + corner-weighted shade), never by tinting the type — type stays white at every phase. Measured floor over a pinned day mesh: faintest text ≥6:1 realized; worst icon plate (dawn dock corner) 4.2:1, carried as non-text under the 3:1 bar.

## Typography

**Display Font:** IBM Plex Sans variable (100–700), self-hosted (`fonts/plex-sans-var.woff2`, `font-display: swap`), with system-ui, -apple-system, Segoe UI fallback.
**Body Font:** same as display — one family for everything.
**Label/Mono Font:** none distinct; labels are the same family at 600.

**Character:** confident grotesque with tight tracking at large sizes and tabular numerals throughout; quiet 13–15px voice for everything that isn't the readout.

### Hierarchy
- **Display** (700, clamp(84px, 15vw, 168px) → clamp(64px, 22vw, 110px) on ≤720px, line-height 0.92, letter-spacing −0.045em): the timer readout only, with a soft drop shadow (0 6px 40px rgb(0 0 0 / 0.22)).
- **Headline** (700, clamp(28px, 2.2vw, 38px), line-height 1, letter-spacing −0.03em): the corner clock.
- **Title** (700, 24px, letter-spacing −0.02em): the current task line; panel headings step down to 15px/600/−0.01em.
- **Body** (400, 15px, line-height 1.5, max ~60ch in stage copy): notes, tasks, suggestions, settings fields.
- **Label** (600, 11–14px, letter-spacing −0.01em): mode pills, buttons, tabs, search-engine tag, sync status (11px), key hints.

### Named Rules
**The Tabular Numerals Rule.** Any number that can change (readout, clock, countdowns) sets `font-variant-numeric: tabular-nums` so columns never jitter.
**The One Voice Above the Timer Rule.** When day line and task combine, the stack tightens and the intention drops to 13px whisper under the task — never two loud lines.

## Layout

Single-viewport shell, no scroll: `.app` is a 100%-height grid (26px 30px padding; 18px on ≤720px) with topbar and stage overlaid in the same cell so the timer sits at the true viewport centre. The stage is three rows — chrome above, readout, chrome below — with equal 1fr tracks pinning the timer to centre.

Centre column is `min(720px, 100%)` (search + favorites); floating panel is fixed bottom-left `min(360px, 100vw − 44px)`, max-height `min(60vh, 520px)`. Docks are fixed bottom pills (22px insets). Topbar spreads date/weather left, clock right, with a quiet segmented tab row centred in the empty band between. Rhythm is 2/6/10/14/18/24px gaps — 6px inside pills, 14–18px between stage rows, 24px across the topbar.

Search field and favorites share that column's two edges: the field fills it, and the tiles are equal grid tracks under it (`repeat(auto-fit, minmax(150px, 1fr))`, 8px gaps) so eight favorites read 1–4 above 5–8 in reading order. Centred wrapping sized each row by its own labels, which moved a tile whenever a name changed while its number stayed put.

Responsive: ≤720px tightens padding, gaps, and readout; ≤480px stacks the right dock above the left (with panel and player rising to match) only while a sync state is visible — slim docks stay bottom-aligned; ≤380px always stacks; short viewports (≤780px, ≤620px height) shrink the readout and stack gaps, and ≤440px height returns the topbar to its own row. The favorites grid answers to its column rather than a breakpoint: four tracks at full width, three near 560px, two on phones. Touch (`hover: none`) keeps key hints visible instead of hover-revealed, and gives stacked menu rows their own height. No load entrance on `.stage` — a backwards-fill slide held the whole column 10px low and made the timer read off-centre.

## Elevation & Depth

Flat glass at rest; depth arrives through blur layering and the scrim, with shadows reserved for floating layers and hover lifts.

### Shadow Vocabulary
- **Floating panel** (`box-shadow: 0 20px 60px rgb(0 0 0 / 0.35)`): panel, player, settings, keys dialog.
- **Suggestion sheet** (`box-shadow: 0 16px 48px rgb(0 0 0 / 0.35)`): search suggestions.
- **Menu** (`box-shadow: 0 16px 40px rgb(0 0 0 / 0.45)`): task overflow menu.
- **Hover lift** (`box-shadow: 0 8px 24px rgb(0 0 0 / 0.28)` on primary buttons; `0 8px 20px rgb(0 0 0 / 0.22)` on favorites): pressable things rising 2–3px on hover.
- **Readout anchor** (`text-shadow: 0 6px 40px rgb(0 0 0 / 0.22)`): keeps the giant numerals seated on bright blobs.

Blur ladder: 10px (buttons, inputs, tabs), 14px (docks, suggestions), 22px (panels, player, settings). Backdrop on the settings scrim is 3px.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest; shadows appear only as a response to state — floating, hovering, or opening.
**The Blur Ladder Rule.** Resting controls 10px, docks 14px, floating layers 22px. Never invent an intermediate blur.

## Shapes

Pills for everything touchable, 16px cards for everything floating, hairline glass borders throughout.

Controls (buttons, modes, tabs, search field, docks, toggle rows) are fully round (999px). Floating layers (panel, suggestions, settings, player, keys) are gently curved cards (16px). Fields inside settings and editors step down to 8px; rows and suggestion items to 10px; key hints and kbd tags to 5–6px; focus ring to 4px. Dots and icon buttons are circular; the player frame and range thumbs follow suit (8px frame, 11px round thumbs). Borders are 1px glass-line, 1.5px at 55% white for mode pills and checkboxes; the favorites "add" tile is the lone dashed border. No clipping tricks, no angled geometry — the mesh blobs carry all the organic form.

## Components

### Buttons
- **Shape:** pill (999px), 1px glass-line border, 11px 24px padding, 10px blur, 600 15px type.
- **Primary:** filled near-white (rgb(255 255 255 / 0.95)) with Inverted Ink text, min-width 128px; hover goes pure white and lifts 2px with a soft shadow.
- **Hover / Focus:** glass buttons wash to Glass Hover; visible focus is a 2px white outline offset 3px everywhere. Active presses scale to 0.94 (dock/icon buttons 0.88).
- **Ghost:** borderless white-soft text buttons (task rows, results, ghost actions) that wash to 8–12% white on hover.

### Segmented tabs / Mode pills
- **Style:** 3px-padding glass pill bar with 2px gaps; options are borderless 600 14px pills (6px 16px).
- **State:** selected tab is filled near-white with Inverted Ink text; mode pills are outlined (1.5px 55% white) at rest and fill on active with a 0.34s spring pop.

### Cards / Containers
- **Corner Style:** 16px floating cards.
- **Background:** one deep-violet ladder — rgb(18 12 34) at 0.72 (panel), 0.80 (player), 0.86 (keys), 0.94 (settings, suggestions), 0.96 (sticky settings head, task-menu) — always with 22px blur. Opacity, never hue, separates the layers.
- **Shadow Strategy:** floating-panel shadow; see Elevation.
- **Border:** 1px glass-line.
- **Internal Padding:** 6px for suggestion lists and the row menu, 8px player, 14px 16px panel heads. 6px is the floor for a list of focusable rows: a 3px-offset ring on a 2px outline reaches 5px, and anything tighter draws focus across the card's own border.

### Inputs / Fields
- **Style:** pill search field in glass with 1px glass-line, 12px 18–20px padding; settings fields are 8px rects (36px tall) on 12% white darkening to 38% black on focus.
- **Focus:** search border shifts to 55% white over near-black fill; login inputs follow the same border shift.
- **Error / Disabled:** invalid settings fields ring Signal Rose; player idle dims to 55% opacity; disabled transport buttons hold quiet-white.

### Navigation
- **Style:** two fixed bottom glass pills (docks), 6px padding/gaps, 34px round icon buttons in quiet-white.
- **States:** hover washes to 14% white and lifts; active (open panel) fills near-white with Inverted Ink. The count chip is a 13px 600 pill variant of the same treatment.

### Interaction & Recovery
- **The Inline Undo Rule.** Deleting a task removes it immediately but leaves an inline “Task deleted. Undo” row in the same list for 8 seconds, restoring the original position and current-task selection.
- **The Named Recovery Rule.** Sync failures name the problem and put a Retry action beside it; a retry in progress says “Saved locally · retrying” (on compact phones the action shortens to “Retrying”).
- **The Visible Help Rule.** Keyboard shortcuts stay available from a visible `?` button in the left dock as well as the `?` key.
- **The Local Timer Rule.** The running timer is deliberately per-device and says “Runs on this device” in its panel, so cross-device state does not imply timer sync.
- **The Pseudo-Target Rule.** Compact controls keep their drawn size but expose an invisible 44px × 44px pseudo-element target, positioned from the control centre without affecting layout. Stacked rows are the exception — overlapping pseudo-targets would fight — so a list of menu rows carries the comfortable height itself on touch.

### Jump tiles
- **Style:** pill tiles in white-0.10 wash with a transparent border (10px 14px padding, 6px gaps, 600 14px monogram + label + key hint). Letterforms distinguish tiles; no decorative colour.
- **Width:** each tile fills its grid track so the set is one width, capped at 200px and centred in the track, which keeps a list of one or two from stretching into banners. An auto width or an auto margin falls back to fit-content and loses the shared edges.
- **Key hint:** pushed to the tile's own right edge, so against equal tracks the eight numbers read as columns rather than trailing each label at a different offset.
- **State:** hover deepens to white-0.20 and lifts 3px with the fav-lift shadow. The add tile is the lone dashed border on the page.

### Icons
- **Set:** Feather line icons, one family throughout. No glyph, emoji, or text character ever stands in for one — a typed `?` in the dock read thinner and smaller than its drawn neighbours because it inherited the body font instead of the stroke.
- **Drawing:** `viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`, `stroke-width="2"`, round caps and joins. Colour always arrives through `currentColor` so an icon inherits its control's state.
- **Sizes:** 18px in the docks and topbar, 16px for in-panel controls, 14px inside settings buttons. The task-more dots are the one stroke exception (2.5), which is what makes three dots read at 16px.

### Quiet rows
- **Style:** suggestion, task, result, and ghost rows rest transparent (or 8–10% wash inside editors) and hover to 8–14% white; keyboard-active suggestion sits at 12%.
- **State:** icon-only row buttons (task-more, panel-close) are 6px rounds in whisper-white, washing to 10–12% on hover. Estimates hide until row hover (staying visible on touch).

### Row menu
- **Style:** a native `popover` in the top layer, so it clears the panel's own `overflow: auto` instead of being clipped by it; 172px wide, deep-violet at 0.96 with 22px blur, the menu shadow from Elevation.
- **Placement:** hangs off its button's right edge and drops down, flipping to sit above the row only when it does not fit below — the panel is bottom-anchored, so "whichever side has more room" would send almost every menu upward. `max-height` keeps the chosen side inside the viewport and lets it scroll when neither fits. The entrance travels 4px from the side it opened from.
- **Anchoring:** the list scrolls and the window resizes underneath an open menu, so placement re-runs while it is open rather than once. Its height is measured, never written down, so touch sizing or a new action cannot quietly break the flip.

### Signature Component
**The readout.** A 700-weight tabular display numeral at −0.045em tracking with a blinking colon (1s steps, only while running), a springy kick on start (scale to 1.07), a slide-up swap on mode change, and a triple brightness pulse plus confetti on finish. Cycle dots (8px, 30% white with inset ring) fill solid white per completed pomodoro with a spring pop.

## Do's and Don'ts

### Do:
- **Do** keep white type at every mesh phase and fix contrast in the scrim, not the palette.
- **Do** use pills for controls, 16px for floating cards, 8px for fields — and nothing in between without reason.
- **Do** reserve filled white for the single current state (active mode, tab, dock, primary action).
- **Do** draw every icon from the Feather set at 2px stroke on a 24 viewBox, and give a control's icon the same weight as the ones beside it.
- **Do** move with springs (`--spring` 0.34/1.56/0.64/1, `--swift` 0.22/1/0.36/1): presses scale, hovers lift 1–3px, panels rise 10–14px at 0.96–0.98 scale.
- **Do** honour `prefers-reduced-motion` (all motion off), `forced-colors` (fills flatten, so actives outline and sliders/switches go native), and `hover: none` (hints stay visible).

### Don't:
- **Don't** fetch anything on load that isn't needed to read the page — no blocking third-party, no embeds before click, self-hosted font only.
- **Don't** add a second saturated accent, coloured shadow, or competing fill outside the mesh.
- **Don't** put dark text on the colour field or invent a new blur step off the 10/14/22px ladder.
- **Don't** let a text character, glyph, or emoji stand in for an icon, and don't leave a set of equal, keyed destinations at ragged natural widths — equal things get equal tracks.
- **Don't** open more than one panel at once, add a load entrance to the stage, or loop any motion except the running colon.
