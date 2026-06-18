# Chrome MCP Capture — Runbook (Phase 1: click + navigate only)

## Status

- **Live Chrome MCP tools were NOT available in the session that wrote this.**
  `mcp__Claude_in_Chrome__tabs_context_mcp` returned "Claude in Chrome is not connected"
  on repeated retries — extension not reachable.
- `manifest-builder.ts` (this folder) and this runbook were built so a future
  agent session **with** a connected Chrome extension can produce a real
  capture without redesigning anything.
- No real `test-capture/` exists yet. Run the steps below once Chrome MCP is
  connected to produce one.

## Prereqs for the agent running this

- `mcp__Claude_in_Chrome__*` tools present and connected (verify with
  `tabs_context_mcp` — should return tab info, not a connection error).
- A working directory to write into, e.g. `capture/chrome-mcp/test-capture/`.

## Loop

1. **Init**: create a `CaptureSession` (`manifest-builder.ts`) with
   `outDir` and the viewport size you'll use.
2. **Open tab**: `tabs_context_mcp({ createIfEmpty: true })` → get `tabId`.
3. For each browser action you take:
   - Do the action via Chrome MCP (`navigate`, `computer` left_click, etc.)
   - Take a screenshot (`computer` action `screenshot`, or
     `save_to_disk: true` on the action if supported) of the resulting state.
   - Get `session.nextScreenshotName()`, save the screenshot bytes to
     `screenshots/<name>` under `outDir`.
   - Call the matching builder method:
     - Navigation → `session.addNavigate({ url, cursor, screenshotRef })`
     - Click → `session.addClick({ target, cursor, screenshotRef })`
       - `target`: CSS selector if known (from `find`/`read_page` ref),
         else `"coord:x,y"` as fallback.
     - Drawing attention without clicking → `session.addCircle({ target, radius, duration, cursor, screenshotRef })`
   - `cursor.x` / `cursor.y` = viewport pixel coords of the action (from the
     click coordinates you used, or the center of the found element).
4. **Finish**: `session.save()` writes `manifest.json` into `outDir`.
5. **Verify**: open `manifest.json`, confirm event count matches actions
   taken, confirm every `screenshotRef` resolves to a real file in
   `screenshots/`.

## Minimum viable test capture (suggested)

- Navigate to `https://example.com` → screenshot → `addNavigate`
- Click the "More information..." link → screenshot → `addClick`
- Navigate back → screenshot → `addNavigate`
- 3 events, 3 screenshots, one `manifest.json`.

## Known gaps (Phase 1 deliberately excludes)

- No scroll / drag capture.
- No animation-burst frames.
- Cursor position is the click/action point only — no intermediate mouse
  trail is recorded (replay-side bezier animation is generated between
  consecutive event points, not captured).
- `target` selector quality depends on whether `find`/`read_page` was used
  before the click; raw coordinate clicks degrade `target` to a coord string.
