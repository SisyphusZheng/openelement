/**
 * The install-command SHAPE predicate, shared by the projection gate
 * (generate-install-command.ts, which owns the display-file list) and the
 * doc-claims gate (check-doc-claims.ts, which owns the wider prose corpus).
 *
 * The package is the CLI's; the runner, flags, project name and an intentional
 * tag are the docs' choice among the verified spellings. Extracting the
 * predicate keeps ONE definition of "documents the create CLI's command" —
 * two copies would drift exactly the way the commands themselves used to.
 */
import { CREATE_PACKAGE_SPECIFIER } from '../../../packages/create/src/install-command.ts';

/**
 * A documented install command: either the canonical `npm create @openelement`
 * spelling (npm's `@scope` initializer alias resolves it to the create package
 * at the scope's default dist-tag — versionless, so it rides `latest`) or a
 * Node runner (npm exec / npx / pnpm dlx, including the pnpm form's explicit
 * `--package=` + bin — the packed package ships two bins, so a bare
 * `pnpm dlx` cannot resolve one) invoking the create package. The tag slot is
 * optional in both: a copy may pin an exact version or a channel on purpose.
 * The match ends at the specifier — the project name that follows is a free
 * example.
 */
export const DOCUMENTED_COMMAND =
  /(?:npm exec|npx|pnpm dlx)\b[^`\n]*?@openelement\/create(?:@[^\s`]+)?|npm create\s+@openelement(?:@[^\s`]+)?/g;

export const DOCUMENTED_SPECIFIER = /@openelement\/create(?:@[^\s`]+)?/;

/**
 * The comparable shape of an install command: its package specifier with the
 * dist-tag slot normalized, so a deliberately pinned version is compared on the
 * package alone. Runner and flags are the docs' choice among the verified
 * spellings; the package is the CLI's. The canonical
 * `npm create @openelement` spelling normalizes through npm's `@scope` →
 * `@scope/create` initializer alias, so every verified form compares equal on
 * the same package, whether or not it names a tag.
 */
export function commandShape(command: string): string {
  const direct = command.match(DOCUMENTED_SPECIFIER)?.[0];
  // Anchor the tag strip on the final `@<tag>` segment (no `@` inside it), so
  // the package name survives the normalization; a versionless specifier
  // already carries the default tag (`latest`).
  if (direct) {
    return direct.includes('@openelement/create@')
      ? direct.replace(/@[^@\s`]+$/, '@<tag>')
      : `${CREATE_PACKAGE_SPECIFIER}@<tag>`;
  }
  // `npm create @openelement(@<tag>)`: the alias form carries the scope, not
  // the package name — normalize it to the package it resolves to.
  const alias = command.match(/@openelement(?:@[^\s`]+)?/)?.[0];
  if (alias) return `${CREATE_PACKAGE_SPECIFIER}@<tag>`;
  return '';
}
