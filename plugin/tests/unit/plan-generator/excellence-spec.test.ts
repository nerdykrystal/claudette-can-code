/**
 * Unit tests for excellence-spec extraction
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { parseBundle } from '../../../src/core/bundle-parser/index.js';
import { extractExcellenceSpec } from '../../../src/core/plan-generator/excellence-spec.js';

describe('Excellence Spec Extraction', () => {
  let testFixturesDir: string;

  beforeAll(() => {
    testFixturesDir = join(process.cwd(), 'tests', 'fixtures', 'excellence-spec');
    mkdirSync(testFixturesDir, { recursive: true });
  });

  afterAll(() => {
    rmSync(testFixturesDir, { recursive: true, force: true });
  });

  /**
   * Test 1: extractExcellenceSpec(realBundle) → ok=true; value.qaCriteria.length ≥ 5
   * (derived from TQCD §3 + §5); value.exitCriteria contains TQCD §6 declared metrics
   */
  it('should extract QA criteria from TQCD §3 (≥5 items)', () => {
    // Create minimal valid bundle fixture
    const bundleDir = join(testFixturesDir, 'valid-bundle');
    mkdirSync(bundleDir, { recursive: true });

    const prdContent = `---
name: PRD
version: v01
---

# PRD

## § 1 Overview

Test PRD content.

## § 6 Constraints

- No network calls at runtime
- All enforcement non-bypassable
- Zero silent substitution possible
`;

    const trdContent = `---
name: TRD
version: v01
---

# TRD

## § 1 Overview

Test TRD content.
`;

    const avdContent = `---
name: AVD
version: v01
---

# AVD

## § 1 Overview

Test AVD content.
`;

    const tqcdContent = `---
name: TQCD
version: v01
---

# TQCD

## § 3 QA Specification

1. All FR-001…FR-019 have functional tests
2. All BR-001…BR-006 have behavioral tests
3. Hook enforcement exits non-zero on violation
4. Audit logs are append-only and fsync'd
5. 100% line + branch coverage on testable surface

## § 6 Exit Criteria

| Metric | Threshold |
|--------|-----------|
| Line Coverage | 100% |
| Branch Coverage | 100% |
| Function Coverage | 100% |
`;

    const uxdContent = `---
name: UXD
version: v01
---

# UXD

## § 1 Overview

Test UXD content.
`;

    const bidxContent = `---
name: BIDX
version: v01
---

# BIDX

## § BIDX-4 Cross-Reference Matrix

| Closes | Via | Doc | Section |
|--------|-----|-----|---------|
| C-1 | extractExcellenceSpec ignores bundle | PRD | PRD-FR-01 |
| M-9 | parser ignores bundle content | TRD | TRD-FR-01 |
`;

    writeFileSync(join(bundleDir, 'CDCC_PRD_2026-04-26_v01_I.md'), prdContent);
    writeFileSync(join(bundleDir, 'CDCC_TRD_2026-04-26_v01_I.md'), trdContent);
    writeFileSync(join(bundleDir, 'CDCC_AVD_2026-04-26_v01_I.md'), avdContent);
    writeFileSync(join(bundleDir, 'CDCC_TQCD_2026-04-26_v01_I.md'), tqcdContent);
    writeFileSync(join(bundleDir, 'CDCC_UXD_2026-04-26_v01_I.md'), uxdContent);
    writeFileSync(join(bundleDir, 'BIDX_cdcc-v1.1.0_2026-04-26_v01_I.md'), bidxContent);

    const bundleResult = parseBundle(bundleDir);
    expect(bundleResult.ok).toBe(true);

    if (bundleResult.ok) {
      const specResult = extractExcellenceSpec(bundleResult.value);
      expect(specResult.ok).toBe(true);

      if (specResult.ok) {
        const spec = specResult.value;

        // Assert ≥5 QA criteria from TQCD §3
        expect(spec.qaCriteria.length).toBeGreaterThanOrEqual(5);
        expect(spec.qaCriteria[0]?.description).toBeDefined();
        expect(spec.qaCriteria[0]?.sourceDoc).toBe('TQCD');

        // Assert exit criteria from TQCD §6
        expect(spec.exitCriteria.length).toBeGreaterThan(0);
        expect(spec.exitCriteria.some((e) => e.metric.includes('Coverage'))).toBe(true);
      }
    }

    rmSync(bundleDir, { recursive: true, force: true });
  });

  /**
   * Test 2: extractExcellenceSpec(bundle without TQCD §3) → ok=false;
   * error.kind === 'tqcd_missing_section_3'
   */
  it('should return tqcd_missing_section_3 when TQCD §3 missing', () => {
    const bundleDir = join(testFixturesDir, 'missing-tqcd-section-3');
    mkdirSync(bundleDir, { recursive: true });

    const prdContent = `---
name: PRD
version: v01
---

# PRD

## § 1 Overview

Test PRD content.
`;

    const trdContent = `---
name: TRD
version: v01
---

# TRD

## § 1 Overview

Test TRD content.
`;

    const avdContent = `---
name: AVD
version: v01
---

# AVD

## § 1 Overview

Test AVD content.
`;

    // TQCD WITHOUT §3
    const tqcdContent = `---
name: TQCD
version: v01
---

# TQCD

## § 1 Overview

Test TQCD without section 3.

## § 6 Exit Criteria

Line coverage >= 100%
`;

    const uxdContent = `---
name: UXD
version: v01
---

# UXD

## § 1 Overview

Test UXD content.
`;

    const bidxContent = `---
name: BIDX
version: v01
---

# BIDX

## § BIDX-4 Cross-Reference Matrix

No rows yet.
`;

    writeFileSync(join(bundleDir, 'CDCC_PRD_2026-04-26_v01_I.md'), prdContent);
    writeFileSync(join(bundleDir, 'CDCC_TRD_2026-04-26_v01_I.md'), trdContent);
    writeFileSync(join(bundleDir, 'CDCC_AVD_2026-04-26_v01_I.md'), avdContent);
    writeFileSync(join(bundleDir, 'CDCC_TQCD_2026-04-26_v01_I.md'), tqcdContent);
    writeFileSync(join(bundleDir, 'CDCC_UXD_2026-04-26_v01_I.md'), uxdContent);
    writeFileSync(join(bundleDir, 'BIDX_cdcc-v1.1.0_2026-04-26_v01_I.md'), bidxContent);

    const bundleResult = parseBundle(bundleDir);
    expect(bundleResult.ok).toBe(true);

    if (bundleResult.ok) {
      const specResult = extractExcellenceSpec(bundleResult.value);
      expect(specResult.ok).toBe(false);

      if (!specResult.ok) {
        expect(specResult.error.kind).toBe('tqcd_missing_section_3');
      }
    }

    rmSync(bundleDir, { recursive: true, force: true });
  });

  /**
   * Test 3: extractExcellenceSpec derives constraints from PRD/AVD
   */
  it('should extract constraints from PRD §6 and AVD', () => {
    const bundleDir = join(testFixturesDir, 'constraints-bundle');
    mkdirSync(bundleDir, { recursive: true });

    const prdContent = `---
name: PRD
version: v01
---

# PRD

## § 3 QA Specification

1. All FR-001…FR-019 have functional tests
2. All BR-001…BR-006 have behavioral tests
3. Hook enforcement exits non-zero on violation
4. Audit logs are append-only and fsync'd
5. 100% line + branch coverage on testable surface

## § 6 Constraints

- No silent substitution (F3) possible
- No skill-skipping (F6) possible
- Gate-skipping structurally impossible
`;

    const trdContent = `---
name: TRD
version: v01
---

# TRD

## § 1 Overview

Test TRD content.
`;

    const avdContent = `---
name: AVD
version: v01
---

# AVD

## § 2 Constraints and Limitations

- Must maintain 0600 permissions on key files
- Atomic writes required on Windows
`;

    const tqcdContent = `---
name: TQCD
version: v01
---

# TQCD

## § 3 QA Specification

1. All FR-001…FR-019 have functional tests

## § 6 Exit Criteria

| Metric | Threshold |
|--------|-----------|
| Line Coverage | 100% |
`;

    const uxdContent = `---
name: UXD
version: v01
---

# UXD

## § 1 Overview

Test UXD content.
`;

    const bidxContent = `---
name: BIDX
version: v01
---

# BIDX

## § BIDX-4 Cross-Reference Matrix

No rows.
`;

    writeFileSync(join(bundleDir, 'CDCC_PRD_2026-04-26_v01_I.md'), prdContent);
    writeFileSync(join(bundleDir, 'CDCC_TRD_2026-04-26_v01_I.md'), trdContent);
    writeFileSync(join(bundleDir, 'CDCC_AVD_2026-04-26_v01_I.md'), avdContent);
    writeFileSync(join(bundleDir, 'CDCC_TQCD_2026-04-26_v01_I.md'), tqcdContent);
    writeFileSync(join(bundleDir, 'CDCC_UXD_2026-04-26_v01_I.md'), uxdContent);
    writeFileSync(join(bundleDir, 'BIDX_cdcc-v1.1.0_2026-04-26_v01_I.md'), bidxContent);

    const bundleResult = parseBundle(bundleDir);
    expect(bundleResult.ok).toBe(true);

    if (bundleResult.ok) {
      const specResult = extractExcellenceSpec(bundleResult.value);
      expect(specResult.ok).toBe(true);

      if (specResult.ok) {
        const spec = specResult.value;

        // Assert constraints from PRD §6
        expect(spec.constraints.length).toBeGreaterThan(0);
        expect(spec.constraints.some((c) => c.sourceDoc === 'PRD')).toBe(true);

        // Assert constraints from AVD
        expect(spec.constraints.some((c) => c.sourceDoc === 'AVD')).toBe(true);
      }
    }

    rmSync(bundleDir, { recursive: true, force: true });
  });

  /**
   * Test 4: extractExcellenceSpec respects no_exit_criteria_found error
   */
  it('should return no_exit_criteria_found when exit criteria missing', () => {
    const bundleDir = join(testFixturesDir, 'no-exit-criteria');
    mkdirSync(bundleDir, { recursive: true });

    const prdContent = `---
name: PRD
version: v01
---

# PRD

## § 1 Overview

Test PRD.
`;

    const trdContent = `---
name: TRD
version: v01
---

# TRD

Test TRD.
`;

    const avdContent = `---
name: AVD
version: v01
---

# AVD

Test AVD.
`;

    const tqcdContent = `---
name: TQCD
version: v01
---

# TQCD

## § 3 QA Specification

1. Criterion 1
2. Criterion 2

## § 5 Other

Some other content (no § 6).
`;

    const uxdContent = `---
name: UXD
version: v01
---

# UXD

Test UXD.
`;

    const bidxContent = `---
name: BIDX
version: v01
---

# BIDX

No BIDX rows.
`;

    writeFileSync(join(bundleDir, 'CDCC_PRD_2026-04-26_v01_I.md'), prdContent);
    writeFileSync(join(bundleDir, 'CDCC_TRD_2026-04-26_v01_I.md'), trdContent);
    writeFileSync(join(bundleDir, 'CDCC_AVD_2026-04-26_v01_I.md'), avdContent);
    writeFileSync(join(bundleDir, 'CDCC_TQCD_2026-04-26_v01_I.md'), tqcdContent);
    writeFileSync(join(bundleDir, 'CDCC_UXD_2026-04-26_v01_I.md'), uxdContent);
    writeFileSync(join(bundleDir, 'BIDX_cdcc-v1.1.0_2026-04-26_v01_I.md'), bidxContent);

    const bundleResult = parseBundle(bundleDir);
    expect(bundleResult.ok).toBe(true);

    if (bundleResult.ok) {
      const specResult = extractExcellenceSpec(bundleResult.value);
      expect(specResult.ok).toBe(false);

      if (!specResult.ok) {
        expect(specResult.error.kind).toBe('no_exit_criteria_found');
      }
    }

    rmSync(bundleDir, { recursive: true, force: true });
  });
});
