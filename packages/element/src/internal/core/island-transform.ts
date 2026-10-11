/**
 * ./island-transform.ts — Island transform core logic.
 *
 * Pure function: injects island metadata markers into source code.
 * Zero Vite dependency. Usable with any build tool.
 */

import type { IslandTransformOptions, IslandTransformResult } from '@openelement/protocol/island';
import { normalizeSeparators, pathToTagName } from './path-utils.ts';
export type { IslandTransformOptions, IslandTransformResult };

/**
 * Inject island metadata markers into source code.
 *
 * Only transforms files inside the islands directory.
 * Tag names are derived from the file path and normalized to valid custom
 * element names (lowercase letters, digits, and hyphens). Unsafe characters
 * are silently normalized to hyphens.
 */
export function transformIslandSource(
  source: string,
  options: IslandTransformOptions,
): IslandTransformResult {
  const { islandsDir, filePath } = options;
  // Normalize to forward slashes and ensure leading slash for reliable matching
  let normalizedPath = normalizeSeparators(filePath);
  if (!normalizedPath.startsWith('/')) {
    normalizedPath = '/' + normalizedPath;
  }
  const normalizedIslandsDir = normalizeSeparators(islandsDir).replace(/^\/+|\/+$/g, '');

  // Only transform files in the islands directory. The needle is
  // segment-anchored on both sides (`app/islands-backup` never matches) and
  // anchored on its LAST occurrence: an outer same-named directory (nested
  // checkouts, fixtures) must not hijack the admission or the tag derivation
  // — the innermost islands root wins. (Layout-convention admission is the R
  // lane's job, not this gate's.)
  const needle = `/${normalizedIslandsDir}/`;
  const anchor = normalizedIslandsDir === '' ? -1 : normalizedPath.lastIndexOf(needle);
  if (anchor === -1) {
    return { code: source, islands: [] };
  }

  // Extract tag name from file path using the same helper as the SSG route
  // scanner. This keeps route and island tag-name derivation consistent and
  // safely handles edge cases such as top-level numeric file names.
  const relativePath =
    normalizedPath.slice(anchor + needle.length) || normalizedPath.split('/').pop()!;
  const tagName = pathToTagName(relativePath);

  // Files that do not yield a valid name are skipped silently.
  if (!tagName) {
    return { code: source, islands: [] };
  }

  // pathToTagName already guarantees a valid custom element name (or empty).
  // No further validation is needed here.

  // Inject metadata markers
  const injected = `
// --- Island Markers (auto-injected) ---
export const __island = true;
export const __tagName = '${tagName}';
// --- End Island Markers ---
`;

  return {
    code: source + '\n' + injected,
    islands: [{ tagName, filePath }],
  };
}
