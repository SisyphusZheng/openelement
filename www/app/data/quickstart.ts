/**
 * Quickstart copy — the count every page prints, derived from the one authored
 * sequence.
 *
 * The sequence lives in getting-started's Install fence; the count is parsed
 * from it at build time (www/lib/quickstart.ts) and projected into the
 * generated module below, the same way the release line is projected from
 * docs/release/release-state.json. Nothing here restates the steps: the hub
 * prints a phrase built from the generated number, and the guides interpolate
 * `{{QUICKSTART_COMMAND_COUNT}}` (www/lib/content.ts). The manual used to spell
 * the count twice ("three commands" on the hub and in core-concepts) while the
 * fence listed four, and three copies of a number is three chances to go stale.
 */
import { QUICKSTART_COMMAND_COUNT } from './_generated-quickstart.ts';

export { QUICKSTART_COMMAND_COUNT };

/**
 * Copy phrase for the count: "4 commands" / "4 条命令". Digits, not words: the
 * site's one number-word table lives in data/version.ts for package counts
 * spelled in chrome, and a second table here would be the same drift risk the
 * count itself had.
 */
export function quickstartCommandCountPhrase(locale: string): string {
  return locale === 'zh'
    ? `${QUICKSTART_COMMAND_COUNT} 条命令`
    : `${QUICKSTART_COMMAND_COUNT} commands`;
}
