/**
 * The application's UnoCSS configuration, loaded through the official
 * `@unocss/config` loader (`loadConfig`, resolved from the installed `unocss`
 * package). The router never re-implements any of it.
 *
 * `presetWind4` is the dialect the first-party components are authored in:
 * their class tokens (`bg-primary/14`, `focus-visible:outline-ring`,
 * `size-[38px]`) compile here exactly as they do under Tailwind 4 — measured,
 * not assumed: the packed matrix compares both engines' output for the same
 * component sources.
 *
 * The `theme.colors` map is the one place the role names the components use
 * meet the token variables the token source declares. It is ordinary UnoCSS
 * configuration, so a consumer may replace it without touching the framework.
 */
import { defineConfig, presetWind4 } from 'unocss';

export default defineConfig({
  presets: [presetWind4()],
  theme: {
    colors: {
      background: 'var(--color-background)',
      foreground: 'var(--color-foreground)',
      primary: 'var(--color-primary)',
      'primary-foreground': 'var(--color-primary-foreground)',
      border: 'var(--color-border)',
      muted: 'var(--color-muted)',
      ring: 'var(--color-ring)',
      destructive: 'var(--color-destructive)',
    },
  },
});
