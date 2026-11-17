# Plans and Engineering Records

Use a numbered Plan and reciprocal Engineering Record for substantial features, refactors and integrations. The Plan is the current scoped work view; the ER is append-only history for decisions, findings, scope changes and evidence. Keep stable numbers, reciprocal links and both indexes. Never delete a completed or replaced pair.

## Create and maintain a pair

Use the Triangular CLI so numbering, templates and indexes stay consistent:

```sh
triangular docs plan new --title "A short title" --slug lower-kebab-case --root .
triangular docs records review docs/plans/NNN_lower-kebab-case.md --reviewer agent --root .
triangular docs records check --root .
```

If the command is not installed, run `projects/triangular-engine/bin/triangular.mjs` from an available `triangular-engine` checkout with the same arguments. The CLI can target this repository with `--root .`; it does not need to be added as a runtime dependency here.

New Plans use `map_schema: 1` and a stable `initiative_id`. Give each phase a stable ID and observable acceptance condition. Keep open assumptions or investigations in the scoped review markers. Reviewing scope refreshes an agent assessment; it does not record user approval. Baselines require the user's explicit confirmation of the exact scope snapshot. Keep `performance: []` until a verified runnable scenario and launch link exist.

Update Plan status as work proceeds. Append dated results to the ER, distinguish functional, performance and human visual evidence, and record unrun checks honestly. When a pair is complete or superseded, record its outcome and replacement links, then archive it with:

```sh
triangular docs archive docs/plans/NNN_lower-kebab-case.md --root .
```

Archiving replaces the full documents with indexed stubs while preserving the source commit in Git history. The pair must already be in Git history before archiving; do not use `--force` or point the stubs at a commit that lacks the full pair. Agents leave commits to the user/maintainer, so a completed pair may stay unarchived in the working tree until that commit exists. Restore with `triangular docs unarchive <plan-path> --root .`. Do not reuse numbers, remove records or silently rewrite earlier scope.

See [Plan 002](plans/002_testing-video-workflows.md) for the current open exploration.
