/**
 * Cross-environment CSSStyleSheet abstraction.
 *
 * In browsers this delegates to the native CSSStyleSheet API. In SSR runtimes
 * it falls back to a minimal in-memory implementation that exposes the subset
 * used by OpenElement and renderToString().
 */

export interface StyleSheetRule {
  cssText: string;
}

/** Minimal stylesheet contract (replaceSync + cssRules) satisfied by native and shim sheets. */
export interface StyleSheetLike {
  replaceSync(text: string): void;
  readonly cssRules: StyleSheetRule[];
}

/**
 * The one key under which a sheet carries its readiness promise: the generated
 * client style adapter records it on the sheet it exports, and the element
 * runtime reads the same key to hand styles to roots that are already
 * connected. Build-time and runtime cannot drift because the adapter generator
 * interpolates this exact name.
 *
 * The promise settles once. Fulfillment means the rules were installed through
 * `replace()`; rejection carries the load or replacement failure and keeps its
 * rejected state — an observer may attach its own catch, it must never convert
 * the promise into a fulfilled one.
 */
export const STYLE_SHEET_READY = '__openElementStyleReady';
