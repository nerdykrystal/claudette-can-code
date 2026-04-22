# Hook Semantics Reference

All hooks exit non-zero on block or halt. There is no warn-only mode. Every decision is written to the Audit Logger.

| ID | Claude Code Event | Target | Payload Schema | Block Exit Code | Remediation Path |
|----|-------------------|--------|---------------|-----------------|------------------|
| H1 | `UserPromptSubmit` | Input filesystem paths before any tool runs | `schemas/input-manifest.schema.json` — `expectedPaths` (array of globs), `disallowedPaths` (array of globs) | `1` | Declare the undeclared path in the planning bundle's input manifest and re-run `cdcc generate` to update the installed hook configuration. |
| H2 | `Stop` (when `BUILD_COMPLETE` sentinel detected) | Workspace files compared against plan's declared substitution policy | `schemas/deviation-manifest.schema.json` — `substitutions` array with `original`, `replacement`, `reason` per entry | `1` | Produce a `deviation-manifest.json` documenting every detected substitution with a reason, commit it, and re-attempt the Stop event. |
| H3 | `PreToolUse` (session activation) | Worktree filesystem and network allowlist | Plan's `inputManifest.disallowedPaths` | `1` (halt) or file removed per plan config | Remove or declare the disallowed resource. Update the plan's allowlist in the planning bundle and re-run `cdcc generate` if the resource is legitimately needed. |
| H4 | `PreToolUse` on `Write` / `Edit` tool calls | Executing model identifier vs. plan stage `assignedModel` | None (hook reads plan state file directly) | `1` + structured redirect directive on stdout | Use the Agent tool with `model=<assignedModel>` as directed by the redirect directive. Do not attempt to continue the Write/Edit with the current model. |
| H5 | `Stop` (per-stage completion) | `ConvergenceGateResult` payload in stage output | `schemas/convergence-gate-result.schema.json` — `converged` (boolean), `counter` (integer), `findings` array with `severity` and `message` per entry | `1` | Review the findings list in the block output. Address all CRITICAL and HIGH findings. Re-run the stage's work until the Convergence Gate Engine returns `converged: true`. |

## Notes

- H5 runs before H2 on `Stop` events. If H5 blocks, H2 does not run (short-circuit per AD-008).
- H2 and H5 are mutually exclusive in practice: H2 fires only on `BUILD_COMPLETE` sentinel; H5 fires on per-stage `Stop`.
- H4 redirect directives are structured JSON on stdout, consumable by the Claude Code harness without human intervention.
- The Audit Logger receives a write on every hook decision regardless of allow/block/halt outcome.
