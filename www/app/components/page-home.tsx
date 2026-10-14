/** @jsxImportSource @openelement/element */
import {
  computed,
  element,
  OpenElement,
  property,
  trustedHtml,
  type TrustedHtml,
} from '@openelement/element';
import '@openelement/ui/open-code-block';
import '../islands/open-cinematic-scroll.tsx';
import '../islands/open-dragon-live-gaze.tsx';
import '../islands/open-hero-polish.tsx';
import pageHomeStyles from './page-home.css';

interface StrategyItem {
  key: string;
  className: string;
  glyph: string;
  name: string;
  tag: string;
  copy: string;
  uses: string;
}
interface OutputItem {
  key: string;
  className: string;
  name: string;
  description: string;
}
interface ReferenceItem {
  index: string;
  title: string;
  href: string;
  copy: string;
}
interface DiagramSet {
  element: string;
  dsd: string;
  islands: string;
  output: string;
}

/**
 * Presentation is authored as Tailwind utilities on this markup (alpha15
 * utility-first migration). The sheet keeps only what markup cannot carry:
 * the host box, the pseudo-element formulas, the text-stroke formulas, the
 * keyframes/animations with their reduced-motion opt-outs and the
 * scroll-timeline reveal block — each with its reason in page-home.css.
 *
 * Two class-list facts the compiler imposes here:
 *   - every class string is a static literal (the candidate scanner reads the
 *     `class` attribute only; no interpolation, no helper);
 *   - the strategy/output rows are keyed list Blocks, and a list item's class
 *     attribute admits only a static literal or the single `{row.<field>}`
 *     slot — the rows keep the route's data-driven `className`
 *     ('strategy'/'strategy default', 'output-row'/'output-row active'), so
 *     their own boxes are authored on the `.strategies`/`.output-rows`
 *     parents with `[&>*]`/`[&>.default]`/`[&>.active]` child-selector
 *     utilities. The child styles the rows select on are authored on the
 *     children themselves (`[.active_&]:`, `[&:nth-child(2n)]:`).
 *
 * The region hooks the sheet's kept rules and the site's e2e/axe specs address
 * (hero-main, hero-foot, action, hero-stage, spec-strip, spec-cell, spec-fact,
 * version-line, marquee, scene, scene-copy, scene-art, scene-split,
 * scene-outlined, flood, flood-panel, flood-arrow, strategy, glyph,
 * tag-default, output-row, links) stay in the class lists as hooks.
 */
@element('index-index')
export default class PageHome extends OpenElement {
  static override styles = [pageHomeStyles];

  @property({ reflect: false, attribute: false })
  lede = '';
  @property({ reflect: false, attribute: false })
  eyebrow = '';
  @property({ reflect: false, attribute: false })
  versionLine = '';
  @property({ reflect: false, attribute: false })
  versionHref = '';
  @property({ reflect: false, attribute: false })
  enginesValue = '';
  @property({ reflect: false, attribute: false })
  depsValue = '';
  @property({ reflect: false, attribute: false })
  outputValue = '';
  @property({ reflect: false, attribute: false })
  badgeRuntime = '';
  @property({ reflect: false, attribute: false })
  badgeAuthoring = '';
  @property({ reflect: false, attribute: false })
  sceneElementIndex = '';
  @property({ reflect: false, attribute: false })
  sceneDsdIndex = '';
  @property({ reflect: false, attribute: false })
  sceneIslandsIndex = '';
  @property({ reflect: false, attribute: false })
  sceneOutputIndex = '';
  @property({ reflect: false, attribute: false })
  sceneBeginIndex = '';
  @property({ reflect: false, attribute: false })
  floodServer = '';
  @property({ reflect: false, attribute: false })
  floodBrowser = '';
  @property({ reflect: false, attribute: false })
  startBuilding = '';
  @property({ reflect: false, attribute: false })
  watchUnfold = '';
  @property({ reflect: false, attribute: false })
  getStarted = '';
  @property({ reflect: false, attribute: false })
  readGuide = '';
  @property({ reflect: false, attribute: false })
  begin = '';
  /**
   * The hero component example, pre-highlighted at generation time
   * (app/data/_generated-page-code.ts — build-time Shiki, --shiki-* palette).
   */
  @property({ type: Object, reflect: false, attribute: false })
  heroCodeHtml: TrustedHtml = trustedHtml('');
  /** The create CLI's canonical install command (#1414), rendered verbatim. */
  @property({ reflect: false, attribute: false })
  beginCommand = '';
  @property({ reflect: false, attribute: false })
  beginNote = '';
  @property({ reflect: false, attribute: false })
  facts = '';
  @property({ reflect: false, attribute: false })
  continueComposition = '';
  @property({ reflect: false, attribute: false })
  referenceCopy = '';
  @property({ reflect: false, attribute: false })
  commonVersionNote = '';
  @property({ reflect: false, attribute: false })
  marqueeText = '';
  @property({ reflect: false, attribute: false })
  heroMono = '';
  @property({ reflect: false, attribute: false })
  heroSerif = '';
  @property({ reflect: false, attribute: false })
  sceneElementLead = '';
  @property({ reflect: false, attribute: false })
  sceneElementAccent = '';
  @property({ reflect: false, attribute: false })
  sceneElementCopy = '';
  @property({ reflect: false, attribute: false })
  sceneDsdLead = '';
  @property({ reflect: false, attribute: false })
  sceneDsdAccent = '';
  @property({ reflect: false, attribute: false })
  sceneDsdCopy = '';
  @property({ reflect: false, attribute: false })
  sceneIslandsLead = '';
  @property({ reflect: false, attribute: false })
  sceneIslandsAccent = '';
  @property({ reflect: false, attribute: false })
  sceneIslandsCopy = '';
  @property({ reflect: false, attribute: false })
  sceneOutputLead = '';
  @property({ reflect: false, attribute: false })
  sceneOutputAccent = '';
  @property({ reflect: false, attribute: false })
  startBuildingHref = '';
  @property({ reflect: false, attribute: false })
  getStartedHref = '';
  @property({ reflect: false, attribute: false })
  docsHref = '';
  @property({ reflect: false, attribute: false })
  strategies: StrategyItem[] = [];
  @property({ reflect: false, attribute: false })
  outputs: OutputItem[] = [];
  @property({ reflect: false, attribute: false })
  references: ReferenceItem[] = [];
  @property({ reflect: false, attribute: false })
  diagrams: DiagramSet = { element: '', dsd: '', islands: '', output: '' };
  @property({ type: Object, reflect: false, attribute: false })
  diagramElement = computed(() => trustedHtml(this.diagrams.element));
  @property({ type: Object, reflect: false, attribute: false })
  diagramDsd = computed(() => trustedHtml(this.diagrams.dsd));
  @property({ type: Object, reflect: false, attribute: false })
  diagramIslands = computed(() => trustedHtml(this.diagrams.islands));
  @property({ type: Object, reflect: false, attribute: false })
  diagramOutput = computed(() => trustedHtml(this.diagrams.output));

  render() {
    return (
      <div class='overflow-clip bg-background text-foreground' data-pagefind-body>
        <open-cinematic-scroll></open-cinematic-scroll>
        <open-hero-polish></open-hero-polish>
        <section class='relative isolate overflow-clip bg-background @container/band'>
          <div class='hero-main relative grid min-h-[calc(100svh-var(--nav-height))] grid-rows-[auto_minmax(0,1fr)_auto] justify-items-center overflow-clip bg-(--hero-ink) text-center text-(--hero-paper)'>
            <div class='relative z-2 row-start-1 px-[clamp(1.5rem,5vw,4.5rem)] pt-[clamp(2rem,6vh,4rem)] translate-y-[calc(var(--hero-exit,0)*-64px)] opacity-[calc(1-var(--hero-exit,0)*1.15)]'>
              <p class='eyebrow flex items-center justify-center gap-3 font-mono text-(length:--text-xs) font-extrabold tracking-[.16em] text-(--hero-gold-muted) uppercase text-shadow-[0_1px_18px_rgba(0,0,0,.6)] min-[521px]:tracking-[.29em] [&:lang(zh)]:normal-case [&:lang(zh)]:tracking-[.08em] [&:lang(zh)]:leading-[1.9]'>
                {this.eyebrow}
              </p>
              <h1 class='mt-[clamp(1rem,2.5vh,1.75rem)] font-extrabold leading-[.92] tracking-[-.045em] text-shadow-[0_2px_40px_rgba(0,0,0,.65)]'>
                <span class='mono-line block font-mono text-[clamp(2.6rem,6.4vw,5.6rem)] text-(--hero-paper) [@media_(max-height:940px)_and_(min-width:700px)]:text-[clamp(2.6rem,5.6vw,4.8rem)]'>
                  {this.heroMono}
                </span>{' '}
                <span class='serif-line -mt-[0.04em] block font-serif text-[clamp(3.2rem,8.8vw,7.4rem)] font-normal italic tracking-[-.02em] text-(--hero-gold) [@media_(max-height:940px)_and_(min-width:700px)]:text-[clamp(3.2rem,7.6vw,6.4rem)]'>
                  {this.heroSerif}
                </span>
              </h1>
            </div>
            <div class='hero-stage absolute inset-0 z-0 translate-y-[calc(var(--hero-exit,0)*6%)] scale-[calc(1+var(--hero-exit,0)*.07)] opacity-[calc(1-var(--hero-exit,0)*.5)]'>
              <open-dragon-live-gaze></open-dragon-live-gaze>
            </div>
            <div class='hero-foot relative z-2 row-start-3 grid justify-items-center px-[clamp(1.5rem,5vw,4.5rem)] pt-0 pb-[clamp(1.5rem,5vh,3rem)] translate-y-[calc(var(--hero-exit,0)*-32px)] opacity-[calc(1-var(--hero-exit,0))]'>
              <p class='lede m-0 max-w-[36rem] text-[clamp(1rem,1.2vw,1.1rem)] leading-[1.75] text-[rgba(244,241,234,.92)] text-shadow-[0_1px_18px_rgba(0,0,0,.6)] [&:lang(zh)]:leading-[1.9]'>
                {this.lede}
              </p>
              <div class='actions mt-3 mb-0 flex flex-wrap justify-center gap-3'>
                <a
                  class='action inline-flex items-center rounded-md border border-primary bg-primary px-5 py-2 font-bold text-primary-foreground no-underline transition-[border-color,background] duration-[150ms] ease-[ease] hover:border-[color-mix(in_srgb,var(--color-primary)_80%,var(--color-foreground))] hover:bg-[color-mix(in_srgb,var(--color-primary)_80%,var(--color-foreground))]'
                  href={this.startBuildingHref}
                >
                  {this.startBuilding}
                </a>
                <a
                  class='action link inline-flex items-center rounded-md border border-transparent px-1 py-2 font-bold text-(--hero-gold-muted) underline decoration-[color-mix(in_srgb,currentColor_45%,transparent)] underline-offset-[calc(var(--spacing)*1)] transition-[border-color,background] duration-[150ms] ease-[ease] hover:text-(--hero-gold) hover:decoration-current'
                  href='#element'
                >
                  {this.watchUnfold}
                </a>
              </div>
              <span
                class='scroll-cue mt-2 grid justify-items-center gap-2 font-mono text-(length:--font-size-micro) tracking-[.34em] text-[rgba(244,241,234,.62)] uppercase indent-[.34em] [@media(max-height:760px)]:hidden [@media(max-width:520px)]:hidden'
                aria-hidden='true'
              >
                {'Scroll'}
              </span>
            </div>
          </div>
          <div class='spec-strip grid grid-cols-1 border-t border-border @min-[641px]/band:grid-cols-2 @min-[1081px]/band:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))]'>
            <div class='spec-cell flex min-w-0 flex-col justify-center gap-2 border-border border-s-0 px-[clamp(1rem,2.5vw,2rem)] py-4 [&:nth-child(n+2)]:border-t @min-[641px]/band:border-s @min-[641px]/band:[&:nth-child(odd)]:border-s-0 @min-[641px]/band:[&:nth-child(n+2)]:border-t-0 @min-[1081px]/band:[&:nth-child(odd):not(:first-child)]:border-s'>
              <a
                class='version-line block overflow-x-auto font-mono text-(length:--text-sm) font-bold text-foreground whitespace-nowrap no-underline underline-offset-[calc(var(--spacing)*1)] hover:text-primary hover:underline'
                href={this.versionHref}
                target='_blank'
                rel='noopener noreferrer'
              >
                {this.versionLine}
              </a>
              <small class='text-(length:--font-size-micro) leading-[1.4] text-muted-foreground'>
                {this.commonVersionNote}
              </small>
            </div>
            <div class='spec-cell flex min-w-0 flex-col justify-center gap-2 border-border border-s-0 px-[clamp(1rem,2.5vw,2rem)] py-4 [&:nth-child(n+2)]:border-t @min-[641px]/band:border-s @min-[641px]/band:[&:nth-child(odd)]:border-s-0 @min-[641px]/band:[&:nth-child(n+2)]:border-t-0 @min-[1081px]/band:[&:nth-child(odd):not(:first-child)]:border-s'>
              <p class='spec-fact m-0 text-(length:--text-sm) font-semibold leading-[1.4] text-foreground [&:lang(zh)]:leading-[1.9]'>
                {this.enginesValue}
              </p>
            </div>
            <div class='spec-cell flex min-w-0 flex-col justify-center gap-2 border-border border-s-0 px-[clamp(1rem,2.5vw,2rem)] py-4 [&:nth-child(n+2)]:border-t @min-[641px]/band:border-s @min-[641px]/band:[&:nth-child(odd)]:border-s-0 @min-[641px]/band:[&:nth-child(n+2)]:border-t-0 @min-[1081px]/band:[&:nth-child(odd):not(:first-child)]:border-s'>
              <p class='spec-fact m-0 text-(length:--text-sm) font-semibold leading-[1.4] text-primary [&:lang(zh)]:leading-[1.9]'>
                {this.depsValue}
              </p>
            </div>
            <div class='spec-cell flex min-w-0 flex-col justify-center gap-2 border-border border-s-0 px-[clamp(1rem,2.5vw,2rem)] py-4 [&:nth-child(n+2)]:border-t @min-[641px]/band:border-s @min-[641px]/band:[&:nth-child(odd)]:border-s-0 @min-[641px]/band:[&:nth-child(n+2)]:border-t-0 @min-[1081px]/band:[&:nth-child(odd):not(:first-child)]:border-s'>
              <p class='spec-fact m-0 text-(length:--text-sm) font-semibold leading-[1.4] text-foreground [&:lang(zh)]:leading-[1.9]'>
                {this.outputValue}
              </p>
            </div>
          </div>
          {/* `marqueeText` carries the slogan twice by construction (the
              translateX(-50%) seam math — www/app/routes/index/index.tsx), so
              the container shields the duplicate from text consumers:
              `data-nosnippet` keeps search-engine snippets from echoing the
              phrase twice, and `data-pagefind-ignore` keeps it out of the
              site's own search index (the repo's chrome convention — measured:
              pagefind indexes the doubled phrase without it and drops it with
              it; data-nosnippet/aria-hidden alone do not). The page is
              runtime-free, so nothing can clone the second copy at run time;
              aria-hidden keeps it out of the a11y tree. */}
          <div
            class='marquee overflow-hidden border-y border-border bg-(--surface-1) whitespace-nowrap'
            aria-hidden='true'
            data-nosnippet
            data-pagefind-ignore
          >
            <span class='inline-block py-3 font-medium tracking-[.12em] text-(length:--text-sm) text-primary'>
              {this.marqueeText}
            </span>
          </div>
        </section>

        <section
          class='scene scene-split relative grid grid-cols-1 items-center gap-[clamp(2rem,6vw,6rem)] px-[clamp(1.5rem,5vw,4.5rem)] py-[clamp(4rem,10vh,8rem)] @container/band min-[901px]:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)]'
          id='element'
        >
          <span
            class='scene-outlined pointer-events-none absolute left-[clamp(-.5rem,-.4vw,0rem)] top-[clamp(1rem,4vh,3rem)] z-[-1] font-mono text-[clamp(9rem,18vw,16rem)] font-extrabold leading-none text-transparent select-none'
            aria-hidden='true'
          >
            {'01'}
          </span>
          <div class='scene-copy max-w-[34rem] leading-[1.75] text-muted-foreground [&_p+p]:mt-3'>
            <p class='text-(length:--text-xs) font-extrabold tracking-[.24em] text-primary uppercase [&:lang(zh)]:normal-case [&:lang(zh)]:tracking-[.08em] [&:lang(zh)]:leading-[1.9]'>
              {this.sceneElementIndex}
            </p>
            <figure
              class='my-3 text-muted-foreground [&_svg]:block [&_svg]:h-[72px] [&_svg]:w-auto'
              aria-hidden='true'
            >
              <div innerHTML={this.diagramElement} trustedHtml />
            </figure>
            <h2 class='text-[clamp(2.2rem,3.6vw,3.2rem)] font-extrabold leading-none tracking-[-.03em]'>
              {this.sceneElementLead}
              <span class='block font-serif text-[1.15em] font-normal italic text-primary'>
                {this.sceneElementAccent}
              </span>
            </h2>
            <p class='[&:lang(zh)]:leading-[1.9]'>{this.sceneElementCopy}</p>
            <div class='mt-5 flex flex-wrap gap-2'>
              <span class='min-w-0 rounded-md border border-(--border-strong) px-2 py-[2px] text-(length:--text-xs) font-bold tracking-[.06em] text-primary'>
                {this.badgeRuntime}
              </span>
              <span class='min-w-0 rounded-md border border-(--border-strong) px-2 py-[2px] text-(length:--text-xs) font-bold tracking-[.06em] text-primary'>
                {this.badgeAuthoring}
              </span>
            </div>
          </div>
          <div class='scene-art min-w-0'>
            <open-code-block>
              <div innerHTML={this.heroCodeHtml} trustedHtml />
            </open-code-block>
          </div>
        </section>

        <section class='scene flood relative isolate overflow-clip bg-[linear-gradient(135deg,var(--color-primary),var(--color-secondary-foreground))] text-primary-foreground px-[clamp(1.5rem,5vw,4.5rem)] py-[clamp(4rem,10vh,8rem)] @container/band'>
          <div class='flex items-center justify-between gap-4'>
            <p class='text-(length:--text-xs) font-extrabold tracking-[.24em] text-secondary uppercase [&:lang(zh)]:normal-case [&:lang(zh)]:tracking-[.08em] [&:lang(zh)]:leading-[1.9]'>
              {this.sceneDsdIndex}
            </p>
            <figure
              class='m-0 text-muted-foreground [&_svg]:block [&_svg]:h-[72px] [&_svg]:w-auto'
              aria-hidden='true'
            >
              <div innerHTML={this.diagramDsd} trustedHtml />
            </figure>
          </div>
          <h2 class='text-[clamp(2.2rem,3.6vw,3.2rem)] font-extrabold leading-none tracking-[-.03em]'>
            {this.sceneDsdLead}
            <span class='block font-serif text-[1.15em] font-normal italic text-violet-300'>
              {this.sceneDsdAccent}
            </span>
          </h2>
          <div class='scene-copy max-w-[34rem] leading-[1.75] text-secondary [&_p+p]:mt-3'>
            <p class='[&:lang(zh)]:leading-[1.9]'>{this.sceneDsdCopy}</p>
          </div>
          <div class='mt-[clamp(2rem,5vh,3.5rem)] grid grid-cols-1 items-center gap-[clamp(1rem,3vw,2.5rem)] min-[901px]:grid-cols-[1fr_auto_1fr]'>
            <div class='flood-panel rounded-lg border-[1.5px] border-[color-mix(in_srgb,var(--color-primary-foreground)_70%,transparent)] bg-[color-mix(in_srgb,var(--color-primary-foreground)_8%,transparent)] p-5'>
              <small class='mb-3 block text-(length:--font-size-micro) font-bold tracking-[.14em] uppercase'>
                {this.floodServer}
              </small>
              <code class='block text-(length:--text-xs) leading-[1.8] whitespace-pre'>
                {`<open-counter count="0">
  <template shadowrootmode="open">
    <button>0</button>
  </template>`}
              </code>
            </div>
            <span
              class='flood-arrow rotate-90 justify-self-center text-(length:--text-5xl) text-primary-foreground min-[901px]:rotate-0 min-[901px]:justify-self-auto'
              aria-hidden='true'
            >
              {'⟶'}
            </span>
            <div class='flood-panel solid rounded-lg border-[1.5px] border-primary-foreground bg-primary-foreground p-5 text-violet-950'>
              <small class='mb-3 block text-(length:--font-size-micro) font-bold tracking-[.14em] uppercase'>
                {this.floodBrowser}
              </small>
              <span class='mb-2 inline-block rounded-md border-[1.5px] border-dashed border-primary px-3 py-1 text-(length:--text-xs) text-primary'>
                #shadow-root (open)
              </span>
              <code class='block text-(length:--text-xs) leading-[1.8] whitespace-pre'>
                {`└─ <button> → markup available/readable
   upgrade → signals/handlers bound`}
              </code>
            </div>
          </div>
        </section>

        <section class='scene relative px-[clamp(1.5rem,5vw,4.5rem)] py-[clamp(4rem,10vh,8rem)] @container/band'>
          <div class='flex items-center justify-between gap-4'>
            <p class='text-(length:--text-xs) font-extrabold tracking-[.24em] text-primary uppercase [&:lang(zh)]:normal-case [&:lang(zh)]:tracking-[.08em] [&:lang(zh)]:leading-[1.9]'>
              {this.sceneIslandsIndex}
            </p>
            <figure
              class='m-0 text-muted-foreground [&_svg]:block [&_svg]:h-[72px] [&_svg]:w-auto'
              aria-hidden='true'
            >
              <div innerHTML={this.diagramIslands} trustedHtml />
            </figure>
          </div>
          <h2 class='text-[clamp(2.2rem,3.6vw,3.2rem)] font-extrabold leading-none tracking-[-.03em]'>
            {this.sceneIslandsLead}
            <span class='block font-serif text-[1.15em] font-normal italic text-primary'>
              {this.sceneIslandsAccent}
            </span>
          </h2>
          <div class='scene-copy max-w-[34rem] leading-[1.75] text-muted-foreground [&_p+p]:mt-3'>
            <p class='[&:lang(zh)]:leading-[1.9]'>{this.sceneIslandsCopy}</p>
          </div>
          <div class='mt-[clamp(2rem,5vh,3rem)] grid grid-cols-1 border-y border-border @min-[641px]/band:grid-cols-2 @min-[1081px]/band:grid-cols-[repeat(4,1fr)] [&>*]:border-s-0 [&>*]:border-border [&>*]:px-4 [&>*]:py-5 [&>*:first-child]:border-s-0 [&>*:nth-child(n+2)]:border-t [&>.default]:bg-primary/14 @min-[641px]/band:[&>*]:border-s @min-[641px]/band:[&>*:first-child]:border-s-0 @min-[641px]/band:[&>*:nth-child(3)]:border-s-0 @min-[641px]/band:[&>*:nth-child(n+2)]:border-t-0 @min-[1081px]/band:[&>*:nth-child(3)]:border-s'>
            {this.strategies.map((strategy) => (
              <div key={strategy.key} class={strategy.className}>
                <span
                  class='glyph block font-mono text-[clamp(3.5rem,7vw,6.5rem)] font-extrabold leading-none text-transparent'
                  aria-hidden='true'
                >
                  {strategy.glyph}
                </span>
                <strong class='mt-3 block text-(length:--text-xl) font-extrabold'>
                  {strategy.name}
                  <span class='tag-default ms-2 inline-block rounded-md bg-primary px-2 py-[1px] align-middle text-(length:--font-size-micro) font-bold tracking-[.1em] text-primary-foreground'>
                    {strategy.tag}
                  </span>
                </strong>
                <p class='mt-2 text-(length:--text-xs) leading-[1.6] text-muted-foreground'>
                  {strategy.copy}
                </p>
                <footer class='mt-3 text-(length:--font-size-micro) text-muted-foreground'>
                  {strategy.uses}
                </footer>
              </div>
            ))}
          </div>
        </section>

        <section class='scene relative px-[clamp(1.5rem,5vw,4.5rem)] py-[clamp(4rem,10vh,8rem)] @container/band'>
          <div class='flex items-center justify-between gap-4'>
            <p class='text-(length:--text-xs) font-extrabold tracking-[.24em] text-primary uppercase [&:lang(zh)]:normal-case [&:lang(zh)]:tracking-[.08em] [&:lang(zh)]:leading-[1.9]'>
              {this.sceneOutputIndex}
            </p>
            <figure
              class='m-0 text-muted-foreground [&_svg]:block [&_svg]:h-[72px] [&_svg]:w-auto'
              aria-hidden='true'
            >
              <div innerHTML={this.diagramOutput} trustedHtml />
            </figure>
          </div>
          <h2 class='text-[clamp(2.2rem,3.6vw,3.2rem)] font-extrabold leading-none tracking-[-.03em]'>
            {this.sceneOutputLead}
            <span class='block font-serif text-[1.15em] font-normal italic text-primary'>
              {this.sceneOutputAccent}
            </span>
          </h2>
          <div class='mt-[clamp(2rem,5vh,3rem)] border-t border-border [&>*]:grid [&>*]:grid-cols-1 [&>*]:items-center [&>*]:gap-2 [&>*]:border-b [&>*]:border-border [&>*]:px-[clamp(1rem,3vw,2.5rem)] [&>*]:py-4 [&>.active]:bg-primary [&>.active]:text-primary-foreground min-[769px]:[&>*]:grid-cols-[minmax(0,1fr)_auto_auto] min-[769px]:[&>*]:gap-[clamp(1rem,4vw,3rem)]'>
            {this.outputs.map((output) => (
              <div key={output.key} class={output.className}>
                <span class='text-[clamp(2.2rem,4vw,3.5rem)] font-extrabold leading-none tracking-[-.02em]'>
                  {output.name}
                </span>
                <span class='max-w-[22rem] text-(length:--text-xs) leading-[1.6] text-muted-foreground [.active_&]:text-primary-foreground'>
                  {output.description}
                </span>
                <span
                  class='hidden text-(length:--text-6xl) text-ring min-[769px]:inline [.active_&]:text-primary-foreground'
                  aria-hidden='true'
                >
                  →
                </span>
              </div>
            ))}
          </div>
        </section>

        <section class='scene relative px-[clamp(1.5rem,5vw,4.5rem)] py-[clamp(5rem,12vh,9rem)] text-center @container/band'>
          <p class='text-(length:--text-xs) font-extrabold tracking-[.24em] text-primary uppercase [&:lang(zh)]:normal-case [&:lang(zh)]:tracking-[.08em] [&:lang(zh)]:leading-[1.9]'>
            {this.sceneBeginIndex}
          </p>
          <h2 class='font-serif text-[clamp(4rem,8vw,7rem)] font-normal italic leading-none tracking-[-.03em] text-primary'>
            {this.begin}
          </h2>
          <div class='mt-6 inline-flex items-center gap-4 rounded-lg border border-border bg-(--surface-code) px-5 py-3 text-(--surface-code-foreground) text-(length:--text-sm)'>
            <code class='text-success'>$</code>
            <span>{this.beginCommand}</span>
          </div>
          <p class='mx-auto mt-3 mb-0 max-w-[32rem] text-(length:--text-xs) leading-[1.6] text-muted-foreground'>
            {this.beginNote}
          </p>
          <div class='actions mt-6 mb-0 flex flex-wrap justify-center gap-3'>
            <a
              class='action inline-flex items-center rounded-md border border-primary bg-primary px-5 py-2 font-bold text-primary-foreground no-underline transition-[border-color,background] duration-[150ms] ease-[ease] hover:bg-[color-mix(in_srgb,var(--color-primary)_80%,var(--color-foreground))]'
              href={this.getStartedHref}
            >
              {this.getStarted}
            </a>
            <a
              class='action inline-flex items-center rounded-md border border-(--border-strong) px-5 py-2 font-bold text-foreground no-underline transition-[border-color,background] duration-[150ms] ease-[ease] hover:border-primary'
              href={this.docsHref}
            >
              {this.readGuide}
            </a>
          </div>
        </section>

        <section class='border-t border-border px-[clamp(1.5rem,5vw,4.5rem)] py-[clamp(3rem,8vh,6rem)]'>
          <header class='mb-6 flex items-end justify-between gap-8'>
            <div>
              <p class='text-(length:--text-xs) font-extrabold tracking-[.24em] text-primary uppercase [&:lang(zh)]:normal-case [&:lang(zh)]:tracking-[.08em] [&:lang(zh)]:leading-[1.9]'>
                {this.facts}
              </p>
              <h2 class='text-[clamp(2rem,4vw,4rem)] leading-none tracking-[-.04em]'>
                {this.continueComposition}
              </h2>
            </div>
            <p class='max-w-[30rem] leading-[1.5] text-muted-foreground'>{this.referenceCopy}</p>
          </header>
          <div class='links grid grid-cols-1 border border-border min-[521px]:grid-cols-2 min-[1201px]:grid-cols-4'>
            {this.references.map((reference) => (
              <a
                key={reference.href}
                class='grid min-h-40 gap-2 border-b border-border p-5 text-inherit no-underline transition-[background,transform] duration-[200ms] ease-[ease] bg-popover/55 hover:-translate-y-1 hover:bg-[color-mix(in_srgb,var(--color-ring)_18%,var(--color-popover))] [&:last-child]:border-b-0 min-[521px]:border-e min-[521px]:border-b-0 [&:nth-child(2n)]:border-e-0 min-[1201px]:[&:nth-child(2n):not(:last-child)]:border-e'
                href={reference.href}
              >
                <span
                  class='font-mono text-(length:--text-4xl) font-extrabold leading-none text-transparent'
                  aria-hidden='true'
                >
                  {reference.index}
                </span>
                <strong class='text-(length:--text-xl)'>{reference.title}</strong>
                <small class='leading-[1.4] text-muted-foreground'>{reference.copy}</small>
              </a>
            ))}
          </div>
        </section>
      </div>
    );
  }
}
