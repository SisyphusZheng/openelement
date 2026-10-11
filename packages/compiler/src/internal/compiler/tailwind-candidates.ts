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
 * Root scope is part of the fact (requirement 1): a shadow-root component's
 * classes cannot be styled by the document stylesheet, so its candidates feed
 * the component stylesheet that ships to shadow trees
 * ({@linkcode allShadowClassCandidates}); a light-root component's classes live
 * in document DOM and the document entry's own pipeline already covers them, so
 * they are recorded separately and never inflate the shadow sheet.
 *
 * The registry only carries FACTS the compiler could prove statically. A
 * `class={this.<field>}` binding contributes nothing — the compiler cannot
 * know its runtime value, and it must not guess. Completeness for such
 * bindings is the author's explicit declaration through Tailwind's own
 * `@source` mechanisms in the app's CSS entry.
 */

interface RegisteredCandidates {
  readonly shadow: boolean;
  readonly tokens: readonly string[];
}

const candidatesByModule = new Map<string, RegisteredCandidates>();

/** Register one module's statically admitted class candidates (idempotent). */
export function registerClassCandidates(
  importerId: string,
  candidates: readonly string[],
  options: { shadow: boolean },
): void {
  if (candidates.length === 0) return;
  candidatesByModule.set(cleanModuleId(importerId), {
    shadow: options.shadow,
    tokens: [...candidates],
  });
}

/**
 * The candidates one compiled module contributed, or an empty list. Query
 * suffixes on the module id (dev-time cache busting) are stripped, so the
 * authored and dev-served spellings answer identically.
 */
export function classCandidatesForModule(moduleId: string): readonly string[] {
  return candidatesByModule.get(cleanModuleId(moduleId))?.tokens ?? [];
}

/**
 * Every candidate contributed by the modules registered so far, in stable
 * (first-seen) order — the build's full union, shadow and light alike. This is
 * the MEASUREMENT view; the shadow sheet consumes
 * {@linkcode allShadowClassCandidates}.
 */
export function allClassCandidates(): readonly string[] {
  return unionCandidates(() => true);
}

/**
 * The candidates contributed by SHADOW-root components only — the build layer's
 * input for the component stylesheet that ships to shadow trees. Light-root
 * candidates are excluded: their classes live in document DOM and the document
 * entry's own pipeline already covers them, so including them would ship unused
 * rules to every shadow root.
 */
export function allShadowClassCandidates(): readonly string[] {
  return unionCandidates((entry) => entry.shadow);
}

function unionCandidates(include: (entry: RegisteredCandidates) => boolean): readonly string[] {
  const union = new Set<string>();
  for (const entry of candidatesByModule.values()) {
    if (!include(entry)) continue;
    for (const candidate of entry.tokens) union.add(candidate);
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
