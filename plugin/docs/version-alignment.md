# CDCC Version Alignment

## gate-22 M-8 Closure — Version Skew Eliminated

**Finding:** `package.json:version` (1.0.4) and `plugin.json:version` (0.1.0) were on independent
version streams with no documented reason. Consumers cannot determine which version is canonical.

**Resolution:** As of v1.1.0, `plugin.json:version` mirrors `package.json:version`. Both are bumped
together on every release. The single canonical version number is `package.json:version`.

## Going Forward

**Rule:** `package.json:version` IS the version. `plugin.json:version` MUST always equal it.

When cutting a release:
1. Bump `package.json:version` per semver.
2. Bump `plugin.json:version` to the same value.
3. Verify: `grep -r '"version"' plugin.json package.json` should show identical values.

There is no separate version stream for the plugin manifest. The Claude Code plugin manifest
(`plugin.json`) is infrastructure — it does not have its own semantic versioning. It tracks the
package version to eliminate consumer confusion.

## History

| Release | package.json | plugin.json | Note |
|---------|-------------|-------------|------|
| ≤1.0.4  | 1.0.4       | 0.1.0       | Independent streams — gate-22 M-8 finding |
| 1.1.0   | 1.1.0       | 1.1.0       | Aligned — this closure |
