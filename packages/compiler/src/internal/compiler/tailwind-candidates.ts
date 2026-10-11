/**
 * Tailwind class-candidate channel (alpha15 S lane).
 *
 * The compiler never interprets Tailwind's class grammar: a compiled module's
 * compile-time `class` values are collected as OPAQUE STRINGS by the lowering
 * (static literals, primitive-literal attributes, both branches of an admitted
 * conditional class, `each` item-template literals) and travel to the build
 * layer through this registry — the same one-writer/one-reader shape as the
 * style-edge registry. The build layer hands the list to the OFFICIAL Tailwind
 * compiler as explicit candidates (`@source inline(…)`), which owns candidate
 * syntax, utility generation, theme compilation and optimization.
 *
 * The registry only carries FACTS the compiler could prove statically. A
 * `class={this.<field>}` binding contributes nothing — the compiler cannot
 * know its runtime value, and it must not guess. Completeness for such
 * bindings is the author's explicit declaration through Tailwind's own
 * `@source` mechanisms in the app's CSS entry.
 */

const candidatesByModule = new Map<string, readonly string[]>();

/** Register one module's statically admitted class candidates (idempotent). */
export function registerClassCandidates(importerId: string, candidates: readonly string[]): void {
  if (candidates.length === 0) return;
  candidatesByModule.set(cleanModuleId(importerId), [...candidates]);
}

/**
 * The candidates one compiled module contributed, or an empty list. Query
 * suffixes on the module id (dev-time cache busting) are stripped, so the
 * authored and dev-served spellings answer identically.
 */
export function classCandidatesForModule(moduleId: string): readonly string[] {
  return candidatesByModule.get(cleanModuleId(moduleId)) ?? [];
}

/** Every candidate contributed by the modules registered so far, in stable
 * (first-seen) order — the build's union set. */
export function allClassCandidates(): readonly string[] {
  const union = new Set<string>();
  for (const candidates of candidatesByModule.values()) {
    for (const candidate of candidates) union.add(candidate);
  }
  return [...union];
}

/** True when any compiled module contributed candidates. */
export function hasClassCandidates(): boolean {
  return candidatesByModule.size > 0;
}

/** Drop every registered candidate set (a build's bookkeeping is its own lifetime). */
export function clearClassCandidates(): void {
  candidatesByModule.clear();
}

function cleanModuleId(moduleId: string): string {
  return moduleId.split('?', 1)[0]!;
}
