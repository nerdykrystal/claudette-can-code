# Test-to-Requirement Mapping

This table is the authoritative mapping from requirements to tests for the CDCC Plugin MVP. Stage 03 (Haiku) and Stage 04 (Haiku) implementation rows completed.

## Functional Requirements (FR)

| Requirement | Description | Test File | Test Name | Status |
|-------------|-------------|-----------|-----------|--------|
| FR-001 | Bundle Consumer reads 4-doc bundle and asserts approval status | tests/unit/bundle-consumer.test.ts | happy path: all 4 docs approved | Stage 03 |
| FR-002 | Bundle Consumer returns tagged error on missing or unapproved doc | tests/unit/bundle-consumer.test.ts | missing PRD, missing TRD, missing AVD, missing TQCD, unapproved doc (status=Draft) | Stage 03 |
| FR-003 | Plan Generator assigns a model to every stage | tests/unit/plan-generator.test.ts | plan has assignedModel per stage (FR-003) | Stage 03 |
| FR-004 | Plan Generator assigns effort level to every stage | tests/unit/plan-generator.test.ts | plan has effortLevel per stage (FR-004) | Stage 03 |
| FR-005 | Plan Generator assigns spec depth to every stage | tests/unit/plan-generator.test.ts | plan has specDepth per stage (FR-005) | Stage 03 |
| FR-006 | Plan Generator output is deterministic on same input | tests/unit/plan-generator.test.ts | deterministic output: same input + fixed now yields deep-equal | Stage 03 |
| FR-007 | Plan artifact validates against plan.schema.json | tests/unit/plan-generator.test.ts | schema round-trip: generate validates against plan.schema.json | Stage 03 |
| FR-008 | Plan artifact is fsync'd on write | tests/unit/plan-writer.test.ts | atomic write: file exists and is complete | Stage 03 |
| FR-009 | H1 blocks on undeclared input path | tests/reliability/hook-contract.test.ts | H1 handler contract | Stage 04 |
| FR-010 | H2 blocks on unsigned substitution | tests/reliability/hook-contract.test.ts | H2 handler contract | Stage 04 |
| FR-011 | H3 halts or removes disallowed resource | tests/reliability/hook-contract.test.ts | H3 handler contract | Stage 04 |
| FR-012 | Convergence Gate Engine with threshold + severity policy | tests/unit/gate.test.ts | converge at threshold, reset on CRITICAL/HIGH, handle MEDIUM per policy | Stage 04 |
| FR-013 | H4 blocks and emits redirect on model mismatch | tests/reliability/hook-contract.test.ts | H4 handler contract | Stage 04 |
| FR-014 | H5 blocks on absent or non-converged gate result | tests/reliability/hook-contract.test.ts | H5 handler contract | Stage 04 |
| FR-015 | Audit Logger writes every hook decision | tests/unit/audit-logger.test.ts | write and read audit entry round-trip, preserve existing entries on append | Stage 04 |
| FR-016 | Audit Logger query with filters (hookId, stage, since) | tests/unit/audit-logger.test.ts | filter by hookId, filter by stage, filter by since timestamp | Stage 04 |
| FR-017 | Your Setup Catalog gracefully returns empty on missing settings.json | tests/unit/catalog.test.ts | missing claudeRoot returns all empty arrays, missing settings.json gracefully returns empty mcpServers | Stage 03 |
| FR-018 | Skill-Gap Checker returns missing skills | tests/unit/skill-gap.test.ts | no gaps: all skills present, one stage missing skill, multiple gaps across stages | Stage 03 |
| FR-019 | Hook Installer writes H1-H5 atomically and preserves unrelated keys | tests/unit/hook-installer.test.ts | install hooks into empty settings.json, merge into existing settings, idempotent | Stage 04 |

## Behavioral Requirements (BR)

| Requirement | Description | Test File | Test Name | Status |
|-------------|-------------|-----------|-----------|--------|
| BR-001 | `cdcc generate <planning-dir>` completes end-to-end | tests/e2e/generate.test.ts | — | Stage 05 |
| BR-002 | Block messages include remediation path (user-facing) | tests/reliability/hook-contract.test.ts | H1-H5 handler contracts | Stage 04 |
| BR-003 | `cdcc audit` returns structured log output | tests/unit/audit-logger.test.ts | query returns AuditLogEntry[], CLI wires audit command | Stage 04 |
| BR-004 | All hook exits are non-zero on block (no warn-only) | tests/reliability/hook-contract.test.ts | H1-H5 exit codes | Stage 04 |
| BR-005 | `cdcc dry-run` produces no side effects | tests/e2e/dry-run.test.ts | — | Stage 05 |
| BR-006 | Audit log is append-only and survives crash after fsync | tests/reliability/audit-log-loss-rate.test.ts | write and persist 1000 entries with zero loss, maintain entry integrity | Stage 04 |

## PRD Journey Tests

| Journey | Description | Test File | Test Name | Status |
|---------|-------------|-----------|-----------|--------|
| J1 | Generate plan from valid 4-doc bundle | tests/e2e/generate.test.ts | — | Stage 05 |
| J2 | Hook blocks model substitution in mid-session | tests/e2e/h4-block-journey.test.ts | — | Stage 05 |
| J3 | Gate result check converges after remediation | tests/e2e/h5-gate-journey.test.ts | — | Stage 05 |
| E1 | Missing doc in bundle — user-facing error message | tests/e2e/error-paths.test.ts | — | Stage 05 |
| E2 | Unapproved doc in bundle — user-facing error message | tests/e2e/error-paths.test.ts | — | Stage 05 |
| E3 | Undeclared input path — H1 block with remediation | tests/e2e/error-paths.test.ts | — | Stage 05 |
| E4 | Convergence Gate non-convergence — H5 block with findings list | tests/e2e/error-paths.test.ts | — | Stage 05 |
