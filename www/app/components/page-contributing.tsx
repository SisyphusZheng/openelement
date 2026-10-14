/**
 * Contributing page element. The route owns request/locale projection; this
 * module owns only the compiled page structure and its declared properties.
 *
 * Presentation is authored as Tailwind utilities on this markup (alpha15
 * utility-first migration). The sheet keeps only what markup cannot carry —
 * the host box, the box-sizing basis, the pseudo-element subjects, the fence's
 * block-scroll rule — each with its reason in page-contributing.css.
 *
 * Two class-list facts the compiler imposes here:
 *   - every class string is a static literal (the candidate scanner reads the
 *     `class` attribute only; no interpolation, no helper);
 *   - the checklist chip's class is the route's data-driven `checkboxClass`
 *     ('checkbox' / 'checkbox open'), and a list item's class attribute admits
 *     only a static literal or that single value — so the chip's box is
 *     authored on its list item with `[&>.checkbox…]` child-selector
 *     utilities.
 */
import {
  element,
  OpenElement,
  property,
  trustedHtml,
  type TrustedHtml,
} from '@openelement/element';
import '@openelement/ui/open-code-block';
import '@openelement/ui/open-button';
import pageContributingStyles from './page-contributing.css';
import '#site-ui/open-reading-shell.tsx';
import '#site-ui/open-artifact-panel.tsx';
import '../islands/open-page-rail.tsx';

interface ReleaseItem {
  id: string;
  before: string;
  code1: string;
  middle1: string;
  code2: string;
  middle2: string;
  code3: string;
  after: string;
}

interface ChecklistItem {
  id: string;
  checkboxClass: string;
  mark: string;
  text: string;
}

interface HelpRow {
  id: string;
  index: string;
  title: string;
  copy: string;
}

@element('contributing-page', { root: 'shadow-open' })
export default class PageContributing extends OpenElement {
  static override styles = [pageContributingStyles];

  @property({ reflect: false, attribute: false })
  eyebrow = '';
  @property({ reflect: false, attribute: false })
  monoLine = '';
  @property({ reflect: false, attribute: false })
  serifLine = '';
  @property({ reflect: false, attribute: false })
  lede = '';
  @property({ reflect: false, attribute: false })
  setupAriaLabel = '';
  /**
   * The setup command sequence, pre-highlighted at generation time
   * (app/data/_generated-page-code.ts — build-time Shiki, --shiki-* palette).
   */
  @property({ type: Object, reflect: false, attribute: false })
  setupCodeHtml: TrustedHtml = trustedHtml('');
  @property({ reflect: false, attribute: false })
  setupLabel = '';
  @property({ reflect: false, attribute: false })
  setupCopyBefore = '';
  @property({ reflect: false, attribute: false })
  setupCopyVite = '';
  @property({ reflect: false, attribute: false })
  setupCopyBetween = '';
  @property({ reflect: false, attribute: false })
  setupCopyNpm = '';
  @property({ reflect: false, attribute: false })
  setupCopyAnd = '';
  @property({ reflect: false, attribute: false })
  setupCopyNpx = '';
  @property({ reflect: false, attribute: false })
  setupCopyAfter = '';
  @property({ reflect: false, attribute: false })
  releaseLabel = '';
  @property({ reflect: false, attribute: false })
  releaseItems: ReleaseItem[] = [];
  @property({ reflect: false, attribute: false })
  beforePrLabel = '';
  @property({ reflect: false, attribute: false })
  checklist: ChecklistItem[] = [];
  @property({ reflect: false, attribute: false })
  layeringCopy = '';
  @property({ reflect: false, attribute: false })
  helpLabel = '';
  @property({ reflect: false, attribute: false })
  helpRows: HelpRow[] = [];
  @property({ reflect: false, attribute: false })
  calloutLabel = '';
  @property({ reflect: false, attribute: false })
  calloutIntro = '';
  @property({ reflect: false, attribute: false })
  discussionsLabel = '';
  @property({ reflect: false, attribute: false })
  discussionsHref = '';
  @property({ reflect: false, attribute: false })
  calloutBetween = '';
  @property({ reflect: false, attribute: false })
  issuesLabel = '';
  @property({ reflect: false, attribute: false })
  issuesHref = '';
  @property({ reflect: false, attribute: false })
  calloutAfter = '';
  @property({ reflect: false, attribute: false })
  changelogLabel = '';
  @property({ reflect: false, attribute: false })
  changelogHref = '';
  @property({ reflect: false, attribute: false })
  roadmapLabel = '';
  @property({ reflect: false, attribute: false })
  roadmapHref = '';

  render() {
    return (
      <div data-pagefind-body>
        <header class='masthead relative isolate px-[clamp(1.5rem,5vw,4.5rem)] pt-[clamp(4rem,11vh,8rem)] pb-[clamp(2.5rem,6vh,4.5rem)]'>
          <p class='eyebrow my-0 flex items-center gap-3 text-primary font-mono text-(length:--text-xs) font-extrabold tracking-[0.29em] uppercase [&:lang(zh)]:normal-case [&:lang(zh)]:tracking-[0.08em]'>
            {this.eyebrow}
          </p>
          <h1 class='mt-[clamp(1.5rem,4vh,3rem)] mb-0 leading-[0.92]'>
            <span class='block font-mono text-[clamp(3rem,8vw,7rem)] font-[800] tracking-[-0.05em] text-foreground'>
              {this.monoLine}
            </span>{' '}
            <span class='block font-serif text-[clamp(3.4rem,9vw,8rem)] font-normal italic tracking-[-0.02em] text-primary'>
              {this.serifLine}
            </span>
          </h1>
          <p class='mt-[clamp(1.25rem,3vh,2rem)] mb-0 max-w-[38rem] text-muted-foreground text-[clamp(1rem,1.2vw,1.1rem)] leading-[1.75]'>
            {this.lede}
          </p>
        </header>

        <section
          class='grid grid-cols-1 gap-[clamp(2rem,6vw,6rem)] border-t border-border px-[clamp(1.5rem,5vw,4.5rem)] py-[clamp(2.5rem,6vh,4.5rem)] min-[901px]:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]'
          aria-label={this.setupAriaLabel}
        >
          <div class='grid grid-cols-[minmax(0,1fr)] content-start gap-4'>
            <p class='my-0 text-primary font-mono text-(length:--text-xs) font-extrabold tracking-[0.24em] uppercase'>
              {this.setupLabel}
            </p>
            <open-code-block>
              <div innerHTML={this.setupCodeHtml} trustedHtml />
            </open-code-block>
            <p class='my-0 text-muted-foreground text-(length:--text-sm) leading-[1.75]'>
              {this.setupCopyBefore}
              <span class='rounded-md border-[0.5px] border-border bg-muted px-[0.375rem] py-[0.125rem] font-mono text-(length:--text-xs)'>
                {this.setupCopyVite}
              </span>
              {this.setupCopyBetween}
              <span class='rounded-md border-[0.5px] border-border bg-muted px-[0.375rem] py-[0.125rem] font-mono text-(length:--text-xs)'>
                {this.setupCopyNpm}
              </span>
              {this.setupCopyAnd}
              <span class='rounded-md border-[0.5px] border-border bg-muted px-[0.375rem] py-[0.125rem] font-mono text-(length:--text-xs)'>
                {this.setupCopyNpx}
              </span>
              {this.setupCopyAfter}
            </p>
            <p class='my-0 text-primary font-mono text-(length:--text-xs) font-extrabold tracking-[0.24em] uppercase'>
              {this.releaseLabel}
            </p>
            <ol class='release my-0 grid list-none gap-2 p-0 [counter-reset:release] text-muted-foreground font-mono text-(length:--text-xs) leading-[1.7]'>
              {this.releaseItems.map((item) => (
                <li class='grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-3' key={item.id}>
                  <span>
                    {item.before}
                    <span class='empty:hidden rounded-md border-[0.5px] border-border bg-muted px-[0.375rem] py-[0.125rem] text-(length:--font-size-micro)'>
                      {item.code1}
                    </span>
                    {item.middle1}
                    <span class='empty:hidden rounded-md border-[0.5px] border-border bg-muted px-[0.375rem] py-[0.125rem] text-(length:--font-size-micro)'>
                      {item.code2}
                    </span>
                    {item.middle2}
                    <span class='empty:hidden rounded-md border-[0.5px] border-border bg-muted px-[0.375rem] py-[0.125rem] text-(length:--font-size-micro)'>
                      {item.code3}
                    </span>
                    {item.after}
                  </span>
                </li>
              ))}
            </ol>
          </div>

          <div class='grid grid-cols-[minmax(0,1fr)] content-start gap-4'>
            <p class='my-0 text-primary font-mono text-(length:--text-xs) font-extrabold tracking-[0.24em] uppercase'>
              {this.beforePrLabel}
            </p>
            <ul class='checklist my-0 grid list-none gap-4 p-0'>
              {this.checklist.map((item) => (
                <li
                  class='grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 text-muted-foreground font-mono text-(length:--text-sm) leading-[1.6] [&>.checkbox]:inline-grid [&>.checkbox]:size-5 [&>.checkbox]:place-items-center [&>.checkbox]:rounded-md [&>.checkbox]:bg-primary [&>.checkbox]:text-(length:--text-xs) [&>.checkbox]:font-extrabold [&>.checkbox]:text-primary-foreground [&>.checkbox.open]:border-[1.5px] [&>.checkbox.open]:border-[color-mix(in_srgb,var(--color-ring)_55%,transparent)] [&>.checkbox.open]:bg-transparent'
                  key={item.id}
                >
                  <span class={item.checkboxClass} aria-hidden='true'>
                    {item.mark}
                  </span>
                  <span>{item.text}</span>
                </li>
              ))}
            </ul>
            <p class='my-0 text-muted-foreground text-(length:--text-sm) leading-[1.75]'>
              {this.layeringCopy}
            </p>
          </div>
        </section>

        <section class='grid border-t border-border' aria-label={this.helpLabel}>
          <p class='my-0 px-[clamp(1.5rem,5vw,4.5rem)] pt-[clamp(2rem,5vh,3.5rem)] pb-4 text-primary font-mono text-(length:--text-xs) font-extrabold tracking-[0.24em] uppercase'>
            {this.helpLabel}
          </p>
          {this.helpRows.map((item) => (
            <div
              class='help-row grid grid-cols-[minmax(0,1fr)] items-center gap-2 border-t border-border px-[clamp(1.5rem,5vw,4.5rem)] py-[clamp(1.25rem,3vh,2rem)] min-[901px]:grid-cols-[minmax(4rem,0.14fr)_minmax(0,0.9fr)_minmax(0,1.1fr)] min-[901px]:gap-[clamp(1rem,4vw,4rem)]'
              key={item.id}
            >
              <span
                class='font-mono text-[clamp(2.2rem,4.5vw,3.4rem)] font-[800] leading-none text-transparent [-webkit-text-stroke:1.5px_color-mix(in_srgb,var(--color-ring)_55%,transparent)]'
                aria-hidden='true'
              >
                {item.index}
              </span>
              <span class='font-mono text-(length:--text-xl) font-[800] tracking-[-0.01em] text-foreground'>
                {item.title}
              </span>
              <p class='my-0 text-muted-foreground font-mono text-(length:--text-xs) leading-[1.7]'>
                {item.copy}
              </p>
            </div>
          ))}
        </section>

        <aside class='my-[clamp(2.5rem,6vh,4.5rem)] mx-[clamp(1.5rem,5vw,4.5rem)] rounded-lg border border-[color-mix(in_srgb,var(--color-ring)_40%,transparent)] border-s-4 border-s-primary bg-[color-mix(in_srgb,var(--color-secondary)_30%,var(--color-popover))] px-6 py-5'>
          <p class='mt-3 mb-0 text-muted-foreground font-mono text-(length:--text-sm) leading-[1.75] font-extrabold tracking-[0.16em] uppercase'>
            {this.calloutLabel}
          </p>
          <p class='mt-3 mb-0 text-muted-foreground font-mono text-(length:--text-sm) leading-[1.75]'>
            <span>{this.calloutIntro}</span>
            <a class='text-primary no-underline hover:underline' href={this.discussionsHref}>
              {this.discussionsLabel}
            </a>
            <span>{this.calloutBetween}</span>
            <a class='text-primary no-underline hover:underline' href={this.issuesHref}>
              {this.issuesLabel}
            </a>
            <span>{this.calloutAfter}</span>
          </p>
        </aside>

        <div class='flex flex-wrap gap-3 px-[clamp(1.5rem,5vw,4.5rem)] pt-0 pb-[clamp(3rem,8vh,6rem)]'>
          <open-button variant='ghost' size='sm' href={this.changelogHref}>
            {this.changelogLabel}
          </open-button>
          <open-button variant='ghost' size='sm' href={this.roadmapHref}>
            {this.roadmapLabel}
          </open-button>
        </div>
      </div>
    );
  }
}
