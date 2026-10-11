import { STYLE_SHEET_READY, type StyleSheetLike } from '@openelement/protocol/style-sheet';
import { scopeCompiledLightCss } from './internal/compiled/style.ts';
import { OpenElementThemeManager } from './open-element-theme.ts';
// Single error dialect (#1386 item 3): style-application failures carry codes.
import { frameworkError, raiseFrameworkError, StyleErrorCode } from '@openelement/protocol/errors';
import { reportError } from './internal/core/errors.ts';

/** Raise one style-application failure with its catalogued code. */
function fail(code: string, message: string): never {
  raiseFrameworkError('csr', code, message);
}

/**
 * Owns the global style registry and host theme propagation.
 *
 * Extracted from the base class (#904, concern: StyleSheet management).
 * The single themeManager instance serves every OpenElement host; the base
 * class only forwards the public statics to it.
 */
export const themeManager = new OpenElementThemeManager();

export type CompiledStyleRoot = HTMLElement | ShadowRoot;

function asStyleList(component?: StyleSheetLike | StyleSheetLike[]): StyleSheetLike[] {
  return [
    ...new Set([
      ...themeManager.getStyles(),
      ...(component ? (Array.isArray(component) ? component : [component]) : []),
    ]),
  ];
}

function styleText(styles: readonly StyleSheetLike[]): string {
  return styles.flatMap((sheet) => [...sheet.cssRules].map((rule) => rule.cssText)).join('\n');
}

/**
 * The readiness promises of sheets that are still filling. The generated client
 * adapter records its promise on the sheet under
 * {@linkcode STYLE_SHEET_READY}; a sheet without one — the dev inline adapter,
 * the SSR shim, a plain sheet — is ready by definition.
 */
export function pendingSheetReadiness(
  styles?: StyleSheetLike | StyleSheetLike[],
): Promise<unknown>[] {
  const list = Array.isArray(styles) ? styles : styles === undefined ? [] : [styles];
  const pending: Promise<unknown>[] = [];
  for (const sheet of list) {
    const ready = (sheet as { [STYLE_SHEET_READY]?: unknown })[STYLE_SHEET_READY];
    if (typeof (ready as { then?: unknown } | undefined)?.then === 'function') {
      pending.push(ready as Promise<unknown>);
    }
  }
  return pending;
}

/**
 * The aggregate readiness of a component's styles, or `undefined` when every
 * sheet is already usable. One pending sheet is not enough to decide: the SSR
 * fallback may only retire once *all* replacing sheets are installed, so the
 * hydration gate consumes this aggregate rather than the first settlement.
 */
export function staticStyleReadiness(
  styles?: StyleSheetLike | StyleSheetLike[],
): Promise<unknown> | undefined {
  const pending = pendingSheetReadiness(styles);
  return pending.length === 0 ? undefined : Promise.all(pending);
}

function isShadowRoot(root: CompiledStyleRoot): root is ShadowRoot {
  return typeof ShadowRoot !== 'undefined'
    ? root instanceof ShadowRoot
    : 'host' in root && 'adoptedStyleSheets' in root;
}

/**
 * Owns the style sink for one compiled element activation. Shadow roots use
 * constructable sheets; light DOM uses one document-head style node so the
 * compiled template's child-node claim shape remains untouched. Sheets this
 * scope applied are tracked so disconnect removes exactly those, preserving
 * sheets the root already had.
 */
export class CompiledStyleScope {
  #root?: CompiledStyleRoot;
  #styles: StyleSheetLike[] = [];
  #lightStyle?: HTMLStyleElement;
  #adoptedSheets: StyleSheetLike[] = [];
  /**
   * One generation per connection. A sheet that settles after this scope moved
   * on — disconnect or a reconnect to another root — must not touch the newer
   * connection's nodes, so every continuation compares the generation it was
   * created under with the current one.
   */
  #generation = 0;

  connect(root: CompiledStyleRoot, component?: StyleSheetLike | StyleSheetLike[]): void {
    const styles = asStyleList(component);
    if (this.#root !== root) {
      this.#removeLightStyle();
      this.#removeAdoptedSheets();
    }
    this.#root = root;
    this.#styles = styles;
    const generation = (this.#generation += 1);

    if (isShadowRoot(root)) {
      if (!('adoptedStyleSheets' in root)) {
        fail(
          StyleErrorCode.ADOPTED_STYLES_UNSUPPORTED,
          '[compiled-styles] shadow root does not support adoptedStyleSheets',
        );
      }
      themeManager.applyStyles(root, component);
      this.#adoptedSheets = styles;
      this.#observeSheetReadiness(styles, generation);
      return;
    }

    if (styles.length === 0) {
      this.#removeLightStyle();
      this.#observeSheetReadiness(styles, generation);
      return;
    }
    this.#writeLightStyle(root);
    this.#observeSheetReadiness(styles, generation);
  }

  /**
   * Report a failed sheet and refresh late styles on the owning connection.
   *
   * Shadow roots need no refresh: they adopted the sheet object itself, and
   * `replace()` publishes its rules to every root holding it. The light path
   * snapshots the rules into its owned node, so it re-writes that same node
   * once the sheets are ready — no second head node, no new owner.
   */
  #observeSheetReadiness(styles: readonly StyleSheetLike[], generation: number): void {
    const pending = pendingSheetReadiness(styles as StyleSheetLike[]);
    if (pending.length === 0) return;
    void Promise.all(pending).then(
      () => {
        const root = this.#root;
        if (generation !== this.#generation || root === undefined || isShadowRoot(root)) return;
        this.#writeLightStyle(root);
      },
      (error: unknown) => {
        // A stale connection reports nothing: its node is gone and the next
        // connection reports its own outcome.
        if (generation !== this.#generation) return;
        reportError(
          frameworkError(
            StyleErrorCode.SHEET_LOAD_FAILED,
            `[compiled-styles] a component style sheet could not be loaded: ${
              error instanceof Error ? error.message : String(error)
            }`,
            {
              phase: 'csr',
              cause: error instanceof Error ? error : undefined,
            },
          ),
        );
      },
    );
  }

  /** Write the owned light-DOM style node for the current connection. */
  #writeLightStyle(root: HTMLElement): void {
    const document = root.ownerDocument;
    const parent = document?.head ?? document?.documentElement;
    if (!document?.createElement || !parent) {
      fail(
        StyleErrorCode.LIGHT_SINK_WITHOUT_DOCUMENT,
        '[compiled-styles] light DOM style sink requires an owner document',
      );
    }
    const style = this.#lightStyle ?? document.createElement('style');
    style.setAttribute('data-open-element-compiled-style', '');
    const globalStyles = themeManager.getStyles();
    const componentStyles = this.#styles.filter((sheet) => !globalStyles.includes(sheet));
    const globalCss = styleText(globalStyles);
    const componentCss = styleText(componentStyles);
    style.textContent = [
      globalCss,
      componentCss ? scopeCompiledLightCss(root.tagName.toLowerCase(), componentCss) : '',
    ]
      .filter(Boolean)
      .join('\n');
    if (style.parentNode !== parent) parent.appendChild(style);
    this.#lightStyle = style;
  }

  adopted(root: CompiledStyleRoot, component?: StyleSheetLike | StyleSheetLike[]): void {
    this.connect(root, component);
  }

  disconnect(): void {
    // Bump the generation first: a sheet settling after this point belongs to a
    // connection that no longer owns a node.
    this.#generation += 1;
    this.#removeLightStyle();
    this.#removeAdoptedSheets();
    this.#root = undefined;
    this.#styles = [];
  }

  get root(): CompiledStyleRoot | undefined {
    return this.#root;
  }

  get styles(): StyleSheetLike[] {
    return [...this.#styles];
  }

  #removeLightStyle(): void {
    this.#lightStyle?.parentNode?.removeChild(this.#lightStyle);
    this.#lightStyle = undefined;
  }

  #removeAdoptedSheets(): void {
    const root = this.#root;
    const applied: Set<unknown> = new Set(this.#adoptedSheets);
    this.#adoptedSheets = [];
    if (!root || applied.size === 0 || !isShadowRoot(root)) return;
    root.adoptedStyleSheets = root.adoptedStyleSheets.filter((sheet) => !applied.has(sheet));
  }
}
