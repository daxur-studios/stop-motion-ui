# ADR-007: Add @angular/router for view navigation

**Status:** Accepted — supersedes ADR-005's "no router" decision.

**Context:** ADR-005 chose a plain signal toggle (`view = signal<'replay' | 'demos'>('replay')`)
over `@angular/router` for switching between the Replay Player and Demo
Gallery views, on the grounds that two views with no deep-linking need
didn't justify the dependency, but flagged that a third view should
prompt revisiting it. The Kitchen Sink page (see
`replay-app/src/app/kitchen-sink/`) became that third view. Separately,
real-world Playwright capture runs surfaced confusing-to-debug behavior
around view switching (see `capture/playwright/RUNBOOK.md` — wizard-step
timeout while driving the in-memory toggle), and explicit navigation with
real URLs is easier to reason about than `page.locator(...).click()`
against a button that only ever mutates a local signal.

**Decision:**

- Added `@angular/router` (pinned to the same version as the rest of
  `@angular/*` — `20.3.17`) and `@angular/cdk`/`@angular/material` bumped
  to `20.2.14` to match.
- `replay-app/src/app/app.routes.ts` defines three flat routes —
  `/replay`, `/demos`, `/kitchen-sink` — plus a `''` redirect to `/replay`
  and a wildcard fallback to the same. No nesting, no guards: still a
  small test-fixture app.
- `app.config.ts` adds `provideRouter(routes)`.
- `app.ts`/`app.html` dropped the `view` signal, `setView()`, and the
  `@if/@else if/@else` template branching in favor of `<router-outlet />`
  and `routerLink`/`routerLinkActive` on the nav anchors (previously
  `<button>`, now `<a>` — updated `app.scss` selector and added
  `text-decoration: none` to keep the look unchanged).
- `kitchen-sink.component.ts`'s `resolveAsyncDurationMs()` still reads
  `window.location.search` directly rather than injecting
  `ActivatedRoute` — that choice was about keeping the function
  DI-free, not about there being no Router, and query params survive the
  `'' -> 'replay'` redirect unchanged either way.

**Consequences:**

- Each view now has a real, bookmarkable/deep-linkable URL — the gap
  ADR-005 explicitly called out as a future revisit trigger is closed.
- Angular CLI's dev server already rewrites unknown paths to
  `index.html` (standard HTML5 history-mode fallback), so direct
  navigation to e.g. `http://localhost:4221/kitchen-sink` works in `ng
  serve` with no extra config. A static production deploy would need the
  same fallback configured at the hosting layer if that ever happens.
- `capture/playwright/src/capture-demo.ts` did not need logic changes —
  it still drives navigation by clicking the `nav-*` `data-testid`
  elements, which now perform real router navigation instead of a signal
  mutation, but the click mechanics are identical from Playwright's
  side. Only the explanatory comments referencing "no router" were
  updated.
- This does not change the zoneless change-detection setup or rule out
  other causes of any click-timing flakiness seen during capture runs —
  it closes the documented deep-linking gap and gives navigation a more
  conventional, debuggable shape, but isn't guaranteed to be the fix for
  any specific Playwright timeout observed separately.
