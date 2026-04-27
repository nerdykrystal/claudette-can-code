// protected-files — Stage 09 public API.
// Exports resolver, types, and schema validator.

export { ProtectedFilesResolverImpl, resolver, matchGlobPattern } from './resolver.js';
export type { ProtectedFilesResolver, MatchResult, ResolverError } from './resolver.js';
export { validateProtectedFilesYaml } from './yaml-schema.js';
export type { ProtectedFilesConfig, ProtectedFilesRule } from './yaml-schema.js';
