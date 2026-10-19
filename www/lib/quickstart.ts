/**
 * The documented quickstart count — the ONE number the manual's copy may print.
 *
 * The sequence itself is authored ONCE, in getting-started's Install fence
 * (www/content/docs/guide/getting-started.md, owned by the starter lane); its
 * first step is the create CLI's canonical install command
 * (packages/create/src/install-command.ts), which the fence carries as
 * `{{INSTALL_COMMAND}}` rather than as a copy.
 *
 * The count is therefore a claim ABOUT that fence, and it derives by parsing
 * it: the manual said "three commands" in two places while the fence listed
 * four, and any number kept beside the fence is one more copy to go stale. The
 * site generator projects the parsed value into `_generated-quickstart.ts` for
 * the hub route (a build-time constant; this module is Node-only), and
 * `check:install-command` asserts that the fence's prose count, its command
 * steps and the consumers all agree — without freezing the number, so a starter
 * lane that legitimately adds or drops a step stays green.
 *
 * Fail closed: a missing fence, an empty fence, or a first step that is not the
 * canonical command is a build error, never a silently wrong count.
 */
import { createInstallCommand } from '@openelement/create/install-command';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** The authored display of the quickstart sequence. */
export const QUICKSTART_SOURCE = 'www/content/docs/guide/getting-started.md';

/** The one install-command spelling every documented sequence starts with. */
export const QUICKSTART_INSTALL_COMMAND = createInstallCommand('my-app');

/**
 * The command steps inside a markdown document's first ```bash fence, with the
 * install placeholder resolved to the canonical command. Exported for the gate:
 * it compares both locales' fences and the prose count against this list.
 */
export function quickstartCommands(markdown: string, source: string): string[] {
  const fence = /```bash\n([\s\S]*?)```/u.exec(markdown);
  if (!fence) {
    throw new Error(
      `content quickstart: ${source} carries no bash fence — the documented ` +
        'quickstart sequence cannot be read.',
    );
  }
  const commands = fence[1]!
    .split('\n')
    .map((line) =>
      line.trim() === '{{INSTALL_COMMAND}}' ? QUICKSTART_INSTALL_COMMAND : line.trim(),
    )
    .filter((line) => line !== '');
  if (commands.length === 0) {
    throw new Error(`content quickstart: ${source}'s bash fence is empty.`);
  }
  if (commands[0] !== QUICKSTART_INSTALL_COMMAND) {
    throw new Error(
      `content quickstart: ${source}'s first command is '${commands[0]}', not the ` +
        `create CLI's canonical '${QUICKSTART_INSTALL_COMMAND}' — use ` +
        '{{INSTALL_COMMAND}} so the sequence cannot drift from the CLI.',
    );
  }
  return commands;
}

/** The repository path of the quickstart source, resolved once per process. */
export function quickstartSourcePath(): string {
  return fileURLToPath(new URL('../../www/content/docs/guide/getting-started.md', import.meta.url));
}

/** How many commands the documented quickstart runs, parsed from the fence. */
export function quickstartCommandCount(): number {
  return quickstartCommands(readFileSync(quickstartSourcePath(), 'utf8'), QUICKSTART_SOURCE).length;
}
