import type { Config } from '@stencil/core';

/**
 * A3 build: compile the fixture's own Stencil host to `dist-custom-elements`,
 * which the fixture app then consumes exactly as it consumes `@ionic/core`.
 *
 * `externalRuntime: false` bundles the Stencil runtime into the emitted
 * component so the consumer side needs no bare `@stencil/core/internal/*`
 * specifier; `@ionic/core` already pins this same compiler version, so the
 * authoring path costs the fixture no extra bytes.
 */
export const config: Config = {
  namespace: 'OeStencilLateHost',
  srcDir: 'app/stencil',
  tsconfig: 'app/stencil/tsconfig.json',
  outputTargets: [
    {
      type: 'dist-custom-elements',
      dir: 'app/client/stencil-dist',
      externalRuntime: false,
      generateTypeDeclarations: false,
    },
  ],
};
