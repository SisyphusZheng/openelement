/**
 * @openelement/element/server — the server HTML constructor helpers
 * (`__h`, `__t`, `__ssr`).
 *
 * The runtime half of the server-only TSX function component lane: the
 * compiler lowers an admitted server function component (the same semantic
 * walk the @element class render body goes through) into a plain exported
 * function whose body is composed of THESE calls — the artifact is generated
 * TS/JS, not an IR and not an interpreter. Internal by convention (`__`
 * prefix): application code calls the compiled components, never the helpers
 * directly, exactly like the generated entry's `__setRequestTimeStyleSheetUrls`.
 *
 * One implementation, many references — this module COPIES NO ESCAPER:
 *
 *   - `__t` is `escapeText` (the ONE DSD-serializer text escape, B1.1/F3)
 *     over the serializer's own displayValue coercion;
 *   - `__h` escapes every attribute value through `escapeAttr` (the ONE
 *     canonical attribute escape), validates names through the one canonical
 *     safe-attribute-name predicate, screens URL-carrying values through the
 *     ONE shared stream-frame URL policy, and routes the `innerHTML` key
 *     through the ONE trustedHtml brand check;
 *   - `__ssr` is the component path's literal server entry: it renders a
 *     registered compiled host through `renderToString` (the compiled
 *     serializer), so a nested @element component in a server function and a
 *     page-level component render through byte-identical machinery.
 *
 * This entry is server-graph-only by construction: it imports the compiled
 * serializer internals directly and never touches the root barrel, so the
 * hydration/claim installs stay out of every server function component module
 * (zero client emission).
 */

import { escapeText } from './internal/compiled/escape-text.ts';
import { displayValue } from './internal/compiled/runtime/program-kernel.ts';
import { classValueOf, styleValueOf } from './internal/compiled/server/shared.ts';
import { escapeAttr } from './internal/core/html-escape.ts';
import { isSafeAttributeName, trustedHtmlValue } from './internal/core/security.ts';
import { renderToString } from './public-runtime.ts';
import { AuthoringErrorCode, frameworkError } from './internal/core/errors.ts';
import { forbiddenSinkReason } from '@openelement/protocol/forbidden-sinks';
import { unsafeStreamFrameAttribute } from '@openelement/protocol/stream-frame-policy';
import { VOID_TAGS } from '@openelement/protocol/void-tags';

/** Source metadata the nested render attributes to the host route (the `{ route }` seam). */
export interface SsrSourceInfo {
  route?: string;
  source?: string;
}

/**
 * Escape one dynamic text value (the ONLY channel untrusted text may take
 * into a server function component's output). Coercion matches the
 * serializer's text-Part pipeline exactly: displayValue, then the ONE
 * `escapeText`.
 */
export function __t(value: unknown): string {
  return escapeText(displayValue(value));
}

/** The element-tag grammar `__h` admits: intrinsic lowercase or a custom-element host. */
const TAG_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/**
 * Construct one element's HTML. `attrs` values are the wire truth:
 * `true` emits a bare attribute, `false`/`null`/`undefined` omit it, arrays
 * and records coerce for `class`/`style` exactly like the serializer, and
 * every other value is attribute-escaped through `escapeAttr`. The reserved
 * `innerHTML` key is the trusted-HTML sink: its value must carry the
 * trustedHtml brand and becomes the element's content (children must be
 * empty — the compiler's shared walk already enforces that shape).
 * `children` are FINAL HTML strings (static text is escaped at compile time,
 * dynamic text arrives through `__t`, nested components through `__ssr` or a
 * direct compiled call).
 */
export function __h(
  tag: string,
  attrs?: Record<string, unknown>,
  children?: readonly unknown[],
): string {
  if (
    typeof tag !== 'string' ||
    !TAG_PATTERN.test(tag) ||
    forbiddenSinkReason('tag', tag) !== null
  ) {
    throw frameworkError(
      AuthoringErrorCode.INVALID_TAG_NAME,
      `[openElement] __h tag ${JSON.stringify(String(tag))} is not an admissible element name — ` +
        'use an intrinsic lowercase element or a custom-element host (raw-text elements are ' +
        'outside the grammar).',
      { phase: 'validation' },
    );
  }
  let open = `<${tag}`;
  let sinkContent: string | undefined;
  for (const [name, value] of Object.entries(attrs ?? {})) {
    if (name === 'innerHTML') {
      // The trusted-HTML sink: brand check first, raw content as the element's
      // children. A forged value (plain object or bare string) fails closed.
      if (value !== null && value !== undefined) sinkContent = trustedHtmlValue(value);
      continue;
    }
    if (!isSafeAttributeName(name)) {
      throw frameworkError(
        AuthoringErrorCode.UNSAFE_ATTRIBUTE_NAME,
        `[openElement] __h attribute name ${JSON.stringify(name)} is unsafe — names must be ` +
          'valid HTML attribute names, not event handlers (on*) or forbidden sinks.',
        { phase: 'validation' },
      );
    }
    let serialized: string;
    if (name === 'class') {
      serialized = classValueOf(value);
      if (serialized === '') continue;
    } else if (name === 'style') {
      serialized = styleValueOf(value);
      if (serialized === '') continue;
    } else {
      if (value === false || value === null || value === undefined) continue;
      if (value === true) {
        open += ` ${name}`;
        continue;
      }
      serialized = displayValue(value);
    }
    // URL screen (defense in depth over the compiler's static-attribute
    // admission): the ONE shared stream-frame URL policy judges the
    // serialized value, so a script-bearing scheme fails closed instead of
    // reaching markup through a dynamic prop.
    if (unsafeStreamFrameAttribute(name, serialized)) {
      throw frameworkError(
        AuthoringErrorCode.UNSAFE_URL_SINK,
        `[openElement] __h URL attribute ${JSON.stringify(name)} received a script-bearing ` +
          `scheme (${JSON.stringify(serialized.slice(0, 32))}); the value is refused.`,
        { phase: 'validation' },
      );
    }
    open += ` ${name}="${escapeAttr(serialized)}"`;
  }
  if (VOID_TAGS.has(tag)) return `${open}>`;
  const content =
    sinkContent ??
    (children ?? [])
      .map((child) => (child === null || child === undefined ? '' : displayValue(child)))
      .join('');
  return `${open}>${content}</${tag}>`;
}

/**
 * Render one registered compiled host (an @element component) to HTML — the
 * component path's literal runtime function: the tag resolves through the SSR
 * registry the generated server entry maintains, and the compiled serializer
 * produces the bytes. Fails closed for unregistered tags (islands and foreign
 * hosts are emitted as plain tags by the compiler instead of routed here).
 */
export function __ssr(
  tag: string,
  props?: Record<string, unknown>,
  sourceInfo?: SsrSourceInfo,
): string {
  return renderToString(tag, {
    ...(props === undefined ? {} : { props }),
    ...(sourceInfo === undefined ? {} : { sourceInfo }),
  });
}
