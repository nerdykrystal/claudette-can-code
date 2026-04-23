# Hello World Planning Bundle — Example

Minimal 4-document D2R planning bundle usable as a dogfood target for CDCC commands.

## Contents

- `HW_PRD_2026-04-22_v01_I.md` — Product Requirements
- `HW_TRD_2026-04-22_v01_I.md` — Technical Requirements
- `HW_AVD_2026-04-22_v01_I.md` — Architecture Vision (Skipped-Status for trivial project)
- `HW_TQCD_2026-04-22_v01_I.md` — Testing & Quality Criteria

## Usage

From this directory:

```
cdcc dry-run .
```

Validates the bundle and produces a plan preview without writing artifacts or installing hooks.

To do a full install (writes `plan.json` + merges H1–H5 hook entries into `./.claude/settings.json` in the current working directory):

```
cdcc generate .
```

## About the example target

The bundle describes a trivially simple SvelteKit 5 Hello World application: one static page, one component (`<Greeting />`), one unit test, one reactive hook. Useful because its simplicity lets CDCC's plan-generation and hook-installation be observed end-to-end without the complexity of a real application obscuring what the plugin is doing.

If you want to dogfood against a more substantial bundle, use any 4-document D2R planning set (PRD + TRD + AVD + TQCD) against any app.
