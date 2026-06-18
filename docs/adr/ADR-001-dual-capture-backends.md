# ADR-001: Dual Capture Backends
**Status:** Accepted

**Context:** Need to capture screenshots + cursor/event metadata from a browser session. Two plausible approaches exist, and there's no clear winner yet for fidelity vs. ease-of-use.

**Decision:**
- Build **two** capture implementations behind a common interface:
  - **Chrome MCP-based** capture — interactive, drives the user's real browser via MCP tools
  - **Playwright-based** capture — scripted/automated, headless or headed
- Both emit the **same output format**: `manifest.json` + `screenshots/` folder
- Replay player is backend-agnostic — it only ever reads the common output format

**Consequences:**
- Lets the user compare fidelity/ease-of-use between the two backends later, with no replay-side rework
- Capture backend logic must stay isolated behind the shared interface — no backend-specific assumptions leak into `shared/` or `replay/`
- Slightly more upfront work (two implementations) in exchange for that comparison
