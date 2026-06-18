# ADR-002: Tech Stack
**Status:** Accepted

**Context:** This is a utility/tool, not an app — needs to stay lightweight and easy to poke at, not a long-lived product.

**Decision:**
- Capture: plain **Node.js + TypeScript** scripts, no framework
- Replay player: standalone **HTML + Canvas** (or SVG) page, no build step, no Angular
- Shared types live in a single `shared/manifest-types.ts`, imported by both capture backends

**Consequences:**
- Fast to iterate on; no framework overhead to learn or maintain
- Replay player can be opened directly in a browser, no dev server required
- If this grows beyond a utility later, stack can be revisited — not locked in
