/**
 * @openelement/router — neutral head-safety predicates.
 *
 * The trust-boundary checks shared by the server document contract
 * (document.ts) and the Vite head-injection path. This module is neutral
 * by design: it imports nothing from the Vite layer and carries no Node
 * dialect, so the WinterTC server contract does not depend on build
 * tooling. Consumers with different failure strategies keep their own
 * wrappers; the predicates here always throw OpenElementError.
 *
 * Provides:
 * - assertNoScriptTags()     — script-tag safety check for trusted fragments
 * - assertTrustedHeadHtml()  — <style> blacklist for trusted fragments
 * - assertAllowlistedHeadFragment() — whole-fragment meta/link/style allowlist
 *                              for the route-resolved (request-data) channel
 * - stripCssComments()/foldCssForCheck() — shared CSS folding helpers
 */

import { OpenElementError } from '@openelement/element/authoring';
import { escapeAttr as escapeHtmlAttr } from '@openelement/element/html';

/**
 * Quote-aware CSS comment stripper shared by the style safety check and the
 * critical-assets serializer. Comment sequences inside quoted strings are
 * content, not comments, so they are preserved (a payload quoted inside a
 * string must still reach the blacklist); a comment that never closes is
 * rejected instead of silently kept. `commentReplacement` is a single space
 * for minification (comments separate tokens there) and the empty string for
 * the safety fold (CSS consumes comments entirely, so `@im/**\/port` is a
 * real `@import`). `code` is the caller's failure strategy for unterminated
 * comments: each call site keeps its own error code.
 */
export function stripCssComments(
  css: string,
  context: string,
  code: string,
  commentReplacement: string,
): string {
  let out = '';
  let quote = '';
  let escaped = false;
  for (let index = 0; index < css.length; index++) {
    const char = css[index];
    const next = css[index + 1];
    if (quote) {
      out += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      out += char;
      continue;
    }
    if (char === '/' && next === '*') {
      index += 2;
      while (index + 1 < css.length && !(css[index] === '*' && css[index + 1] === '/')) {
        index += 1;
      }
      if (index + 1 >= css.length) {
        throw new OpenElementError(`Invalid CSS in ${context}: unterminated CSS comment`, {
          code,
          statusCode: 400,
          recoverable: false,
        });
      }
      index += 1;
      out += commentReplacement;
      continue;
    }
    out += char;
  }
  return out;
}

/** Fold CSS escapes and strip comments so the blacklist below cannot be
 *  bypassed by `@\69mport`, `@im/**\/port`, `u\72l(...)`, or payloads quoted
 *  inside strings. `code` is the caller's error code for unterminated
 *  comments; the blacklist throw itself stays at the call site. */
export function foldCssForCheck(css: string, context: string, code: string): string {
  return (
    stripCssComments(css, context, code, '')
      .replace(/\\([0-9a-fA-F]{1,6})\s?/g, (_m, hex: string) => {
        const parsed = Number.parseInt(hex, 16);
        return parsed === 0 || parsed > 0x10ffff ? '\uFFFD' : String.fromCodePoint(parsed);
      })
      .replace(/\\(.)/g, '$1')
      // Escape sequences can decode to whitespace (`java\9 script`, `java\a script`),
      // which would otherwise split a blacklisted keyword; the URL validator
      // strips the same set (WHATWG URL), so the fold must too.
      .replace(/[\t\n\r\f]/g, '')
  );
}

/**
 * Whether a start tag's attribute text ends in a real self-closing solidus.
 *
 * A minimal subset of the HTML tokenizer's start-tag rules, scoped to this
 * decision only (it is not an HTML parser and makes no policy calls):
 * quoted values are skipped wholesale, unquoted values run to ASCII
 * whitespace or '>' with '/' belonging to the value, and a '/' is a
 * self-closing marker only at a token boundary whose only remaining byte is
 * the terminating '>'.
 */
function hasSelfClosingSolidus(attrs: string): boolean {
  let inUnquotedValue = false;
  for (let index = 0; index < attrs.length; index += 1) {
    const char = attrs[index];
    if (char === '"' || char === "'") {
      const quote = char;
      index += 1;
      while (index < attrs.length && attrs[index] !== quote) index += 1;
      inUnquotedValue = false;
      continue;
    }
    if (/\s/.test(char) || char === '=') {
      inUnquotedValue = false;
      continue;
    }
    if (char === '/') {
      if (!inUnquotedValue && attrs.slice(index + 1).trim() === '') return true;
      inUnquotedValue = true;
      continue;
    }
    inUnquotedValue = true;
  }
  return false;
}

function assertStyleTag(attributes: string, css: string, context: string): string {
  if (
    /(?:@import|expression\s*\(|url\s*\(\s*["']?\s*(?:javascript|data|vbscript|file)\s*:)/i.test(
      foldCssForCheck(css, context, 'UNSAFE_HEAD_INJECTION'),
    )
  ) {
    throw new OpenElementError(`Unsafe CSS in ${context}`, {
      code: 'UNSAFE_HEAD_INJECTION',
      statusCode: 400,
      recoverable: false,
    });
  }
  const rendered: string[] = [];
  const attributePattern = /\s+([A-Za-z_:][A-Za-z0-9_.:-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/gy;
  let offset = 0;
  while (offset < attributes.length) {
    attributePattern.lastIndex = offset;
    const match = attributePattern.exec(attributes);
    if (!match || match.index !== offset) {
      throw new OpenElementError(`Malformed style attribute in ${context}`, {
        code: 'UNSAFE_HEAD_INJECTION',
        statusCode: 400,
        recoverable: false,
      });
    }
    const name = match[1].toLowerCase();
    if (!['media', 'nonce', 'title'].includes(name) || /^on/i.test(name)) {
      throw new OpenElementError(`Unsafe style attribute in ${context}: "${name}"`, {
        code: 'UNSAFE_HEAD_INJECTION',
        statusCode: 400,
        recoverable: false,
      });
    }
    const value = match[2] ?? match[3];
    rendered.push(value === undefined ? name : `${name}="${escapeHtmlAttr(value)}"`);
    offset = attributePattern.lastIndex;
  }
  return `<style${rendered.length ? ` ${rendered.join(' ')}` : ''}>${css}</style>`;
}

/**
 * Assert that every `<style>` element in a trusted head fragment passes the
 * CSS blacklist (assertStyleTag). The assertion is the whole contract — it
 * throws on the first unsafe or malformed element and returns nothing.
 *
 * Structure discovery is deliberately local and strict: an unterminated
 * `<style ...` opening is treated as a raw-text boundary (not assumed to be
 * a complete tag), so an unclosed element cannot carry `@import` past the
 * blacklist. This scanner owns ONLY raw-text boundary detection (quote-aware
 * opening tag, real `>`/`</style>` boundaries, EOF). CSS policy stays in the
 * one canonical validator below.
 */
export function assertTrustedHeadHtml(html: string, context: string): void {
  const lower = html.toLowerCase();
  let index = 0;
  for (;;) {
    const open = lower.indexOf('<style', index);
    if (open === -1) return;
    const boundary = html[open + 6];
    if (boundary !== undefined && /[\w-]/.test(boundary)) {
      // A different tag that merely shares the prefix (e.g. <stylesheet-x>).
      // A '/' after the name is NOT a lookalike: <style/> is style start-tag
      // syntax and must go through the parser (and be rejected as
      // self-closing below).
      index = open + 6;
      continue;
    }
    // Quote-aware scan for the real end of the opening tag.
    let cursor = open + 6;
    let quote = '';
    let tagEnd = -1;
    while (cursor < html.length) {
      const char = html[cursor];
      if (quote) {
        if (char === quote) quote = '';
        cursor += 1;
        continue;
      }
      if (char === '"' || char === "'") {
        quote = char;
        cursor += 1;
        continue;
      }
      if (char === '>') {
        tagEnd = cursor;
        break;
      }
      cursor += 1;
    }
    if (tagEnd === -1) {
      throw new OpenElementError(`Unterminated <style ... in ${context}`, {
        code: 'UNSAFE_HEAD_INJECTION',
        statusCode: 400,
        recoverable: false,
      });
    }
    // The next real closing boundary (skip lookalikes such as </styles>).
    let close = -1;
    let searchFrom = tagEnd + 1;
    for (;;) {
      const candidate = lower.indexOf('</style', searchFrom);
      if (candidate === -1) break;
      let after = candidate + 7;
      while (after < html.length && /\s/.test(html[after])) after += 1;
      if (html[after] === '>') {
        close = candidate;
        cursor = after;
        break;
      }
      searchFrom = candidate + 7;
    }
    if (close === -1) {
      throw new OpenElementError(`Unclosed <style> element in ${context}`, {
        code: 'UNSAFE_HEAD_INJECTION',
        statusCode: 400,
        recoverable: false,
      });
    }
    const attrs = html.slice(open + 6, tagEnd);
    if (hasSelfClosingSolidus(attrs)) {
      throw new OpenElementError(
        `Self-closing <style/> is not valid in ${context}; style is a raw-text element and would swallow the rest of the fragment`,
        {
          code: 'UNSAFE_HEAD_INJECTION',
          statusCode: 400,
          recoverable: false,
        },
      );
    }
    const css = html.slice(tagEnd + 1, close);
    assertStyleTag(attrs, css, context);
    index = cursor + 1;
  }
}

/** Top-level tags a request-data-reachable head fragment may contain. */
const ALLOWLISTED_HEAD_FRAGMENT_TAGS = new Set(['meta', 'link', 'style']);

/** One fail-closed rejection from the route head-fragment scanner. */
function rejectHeadFragment(context: string, detail: string): never {
  throw new OpenElementError(`Unsafe ${context}: ${detail}`, {
    code: 'UNSAFE_HEAD_INJECTION',
    statusCode: 400,
    recoverable: false,
  });
}

const HEAD_FRAGMENT_WHITESPACE_RE = /[ \t\n\r\f]/;
const HEAD_FRAGMENT_TAG_NAME_RE = /<([A-Za-z][A-Za-z0-9-]*)/y;

/**
 * Validate the attribute text of an allowlisted meta/link start tag.
 *
 * Tag admission alone is not enough: `onload`/`onerror` are global event
 * handler attributes, and `<link rel="stylesheet" onload="…">` executes its
 * handler, so request data could still run script through an allowlisted tag.
 * Attribute names therefore reject the `on*` family outright, the syntax is
 * scanned (quoted and unquoted values, unterminated values, malformed
 * self-closing markers), and `<meta http-equiv="refresh">` — a same-document
 * redirect, i.e. the meta spelling of the `<base>` hijack this gate refuses —
 * is rejected. Attribute VALUES stay authored bytes: this channel's contract
 * is "trusted fragments", and the gate's job is to keep the fragment's own
 * grammar from leaving the head.
 */
function assertHeadFragmentAttributes(attributes: string, tagName: string, context: string): void {
  let index = 0;
  while (index < attributes.length) {
    const char = attributes[index]!;
    if (HEAD_FRAGMENT_WHITESPACE_RE.test(char)) {
      index += 1;
      continue;
    }
    if (char === '/') {
      // Self-closing marker on a void element: only trivia may follow it.
      if (attributes.slice(index + 1).trim() === '') return;
      rejectHeadFragment(context, `malformed self-closing marker on <${tagName}>`);
    }
    const nameStart = index;
    while (index < attributes.length && !/[\s=/>]/.test(attributes[index]!)) index += 1;
    if (index === nameStart) rejectHeadFragment(context, `malformed attribute on <${tagName}>`);
    const name = attributes.slice(nameStart, index).toLowerCase();
    if (name.startsWith('on')) {
      rejectHeadFragment(
        context,
        `event-handler attribute "${name}" is not allowed on <${tagName}>`,
      );
    }
    while (index < attributes.length && HEAD_FRAGMENT_WHITESPACE_RE.test(attributes[index]!)) {
      index += 1;
    }
    if (attributes[index] !== '=') continue;
    index += 1;
    while (index < attributes.length && HEAD_FRAGMENT_WHITESPACE_RE.test(attributes[index]!)) {
      index += 1;
    }
    let value: string;
    const quote = attributes[index];
    if (quote === '"' || quote === "'") {
      const valueStart = index + 1;
      index = valueStart;
      while (index < attributes.length && attributes[index] !== quote) index += 1;
      if (index >= attributes.length) {
        rejectHeadFragment(context, `unterminated attribute value on <${tagName}>`);
      }
      value = attributes.slice(valueStart, index);
      index += 1;
    } else {
      const valueStart = index;
      while (index < attributes.length && !/[\s>]/.test(attributes[index]!)) index += 1;
      value = attributes.slice(valueStart, index);
      if (value === '') rejectHeadFragment(context, `empty attribute value on <${tagName}>`);
    }
    if (tagName === 'meta' && name === 'http-equiv' && value.trim().toLowerCase() === 'refresh') {
      rejectHeadFragment(
        context,
        '<meta http-equiv="refresh"> is not allowed in a route-resolved head fragment',
      );
    }
  }
}

/**
 * Assert that a ROUTE-RESOLVED head fragment is only a sequence of top-level
 * `<meta>`, `<link>` and `<style>` elements separated by whitespace.
 *
 * The route channel (`head.dangerouslyHeadFragments` from loader data, params
 * or query) is the only raw-head channel reachable from request data, and its
 * bytes are concatenated into `<head>` as authored. The two legacy predicates
 * are not a whole-fragment grammar: they let `</head>`, `<base>`, comments and
 * an EOF-terminated `<script` through, any of which lets request data close
 * the head early, inject a body, or hijack every relative URL on the page.
 *
 * This scanner therefore REJECTS instead of trusting: comments, markup
 * declarations, end tags, any tag other than the three above (which also
 * rejects `<script>` in every spelling including a bare EOF `<script`),
 * non-whitespace text, an unterminated start tag, an ambiguous `<` inside a
 * start tag, and a style element without its matching `</style>`. `<style>`
 * keeps the one canonical CSS blacklist (assertStyleTag), so its policy is
 * not duplicated here. Config-time channels (`headExtras`,
 * `inject.headFragments`) keep their narrower script/style predicates — they
 * are build configuration, not request data.
 */
export function assertAllowlistedHeadFragment(fragment: string, context: string): void {
  let index = 0;
  while (index < fragment.length) {
    const char = fragment[index]!;
    if (HEAD_FRAGMENT_WHITESPACE_RE.test(char)) {
      index += 1;
      continue;
    }
    if (char !== '<') {
      rejectHeadFragment(
        context,
        `text content is not allowed (offset ${index}); only top-level <meta>, <link> and <style> elements may appear`,
      );
    }
    if (fragment.startsWith('<!--', index)) {
      rejectHeadFragment(context, 'HTML comments are not allowed');
    }
    if (fragment.startsWith('<!', index) || fragment.startsWith('<?', index)) {
      rejectHeadFragment(context, 'markup declarations are not allowed');
    }
    if (fragment[index + 1] === '/') rejectHeadFragment(context, 'end tags are not allowed');
    HEAD_FRAGMENT_TAG_NAME_RE.lastIndex = index;
    const match = HEAD_FRAGMENT_TAG_NAME_RE.exec(fragment);
    if (!match) rejectHeadFragment(context, `unterminated or malformed tag at offset ${index}`);
    const name = match[1]!.toLowerCase();
    if (!ALLOWLISTED_HEAD_FRAGMENT_TAGS.has(name)) {
      rejectHeadFragment(
        context,
        `<${name}> is not allowed; only top-level <meta>, <link> and <style> elements may appear`,
      );
    }
    // Quote-aware scan for the real end of this start tag. A bare '<' inside
    // the tag (unquoted attribute value) is ambiguous to an HTML parser and is
    // not emitted by any element this allowlist admits.
    let cursor = index + match[0].length;
    let quote = '';
    let tagEnd = -1;
    while (cursor < fragment.length) {
      const inside = fragment[cursor]!;
      if (quote) {
        if (inside === quote) quote = '';
        cursor += 1;
        continue;
      }
      if (inside === '"' || inside === "'") {
        quote = inside;
        cursor += 1;
        continue;
      }
      if (inside === '<') {
        rejectHeadFragment(context, `ambiguous '<' inside the <${name}> start tag`);
      }
      if (inside === '>') {
        tagEnd = cursor;
        break;
      }
      cursor += 1;
    }
    if (tagEnd === -1) rejectHeadFragment(context, `unterminated <${name}> start tag`);
    const attrs = fragment.slice(index + match[0].length, tagEnd);
    assertHeadFragmentAttributes(attrs, name, context);
    if (name !== 'style') {
      index = tagEnd + 1;
      continue;
    }
    if (hasSelfClosingSolidus(attrs)) {
      rejectHeadFragment(
        context,
        'self-closing <style/> is not valid; style is a raw-text element and would swallow the rest of the fragment',
      );
    }
    const lower = fragment.toLowerCase();
    let close = -1;
    let searchFrom = tagEnd + 1;
    for (;;) {
      const candidate = lower.indexOf('</style', searchFrom);
      if (candidate === -1) break;
      let after = candidate + 7;
      while (after < fragment.length && HEAD_FRAGMENT_WHITESPACE_RE.test(fragment[after]!))
        after += 1;
      if (fragment[after] === '>') {
        close = candidate;
        cursor = after;
        break;
      }
      searchFrom = candidate + 7;
    }
    if (close === -1) rejectHeadFragment(context, 'unclosed <style> element');
    assertStyleTag(attrs, fragment.slice(tagEnd + 1, close), context);
    index = cursor + 1;
  }
}

/**
 * Assert that HTML content does NOT contain <script> tags.
 * Scripts must go through inject.scripts for URL validation.
 */
export function assertNoScriptTags(html: string, context: string): void {
  if (/<script[\s>/]/i.test(html)) {
    throw new OpenElementError(
      `${context} must not contain <script> tags. Use inject.scripts for scripts so ` +
        'openElement can validate script URLs and mark the generated head injection as trusted.',
      {
        code: 'UNSAFE_HEAD_INJECTION',
        statusCode: 400,
        recoverable: false,
      },
    );
  }
}
