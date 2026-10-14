/**
 * Compiled roadmap page (v0.44, ADR-0143/ADR-0148).
 *
 * The route projects locale, version data, and list records onto declared
 * properties; this module owns only the compiled element and its markup.
 */
import { computed, element, OpenElement, property } from '@openelement/element';
import '@openelement/ui/open-button';
import '../site-ui/open-standards-visual.tsx';
import '#site-ui/open-artifact-panel.tsx';
import '#site-ui/open-section-frame.tsx';
import '#site-ui/open-reading-shell.tsx';
import '../islands/open-page-rail.tsx';
import pageRoadmapStyles from './page-roadmap.css';

interface RoadmapTimelineItem {
  key: string;
  rowClass: string;
  version: string;
  theme: string;
  stampClass: string;
  stampLabel: string;
  copy: string;
  status: string;
}

/**
 * One rendered row: the route's per-item class fields (`tl-row tl-<state>`,
 * `stamp stamp-<kind>`) split into the data attributes the row's
 * `group-data-[…]` utilities match. The compiler admits only static class
 * literals and `{item.<field>}` attribute slots, so a per-item variant must
 * travel as data — the split lives here because attribute slots cannot carry
 * expressions.
 */
interface RoadmapRow extends RoadmapTimelineItem {
  state: string;
  stampKind: string;
}

type CompiledComputed<T> = ReturnType<typeof computed<T>> & T;

interface RoadmapListItem {
  key: string;
  value: string;
}

interface RoadmapMetadata {
  breadcrumb: string;
  title: string;
  lede: string;
}

interface RoadmapRailItem {
  id: string;
  href: string;
  label: string;
  depth: string;
}

@element('roadmap-page')
export default class RoadmapPage extends OpenElement {
  static override styles = [pageRoadmapStyles];

  @property({ reflect: false, attribute: false })
  metadata: RoadmapMetadata = { breadcrumb: '', title: '', lede: '' };
  @property({ reflect: false, attribute: false })
  railItems: RoadmapRailItem[] = [];
  @property({ reflect: false, attribute: false })
  releaseLineIndex = '';
  @property({ reflect: false, attribute: false })
  releaseLineTitle = '';
  @property({ reflect: false, attribute: false })
  releaseLineCopy = '';
  @property({ reflect: false, attribute: false })
  freezeBadge = '';
  @property({ reflect: false, attribute: false })
  nowTitle = '';
  @property({ reflect: false, attribute: false })
  nowCopy = '';
  @property({ reflect: false, attribute: false })
  timelineAria = '';
  @property({ reflect: false, attribute: false })
  timeline: RoadmapTimelineItem[] = [];

  // The rows the markup renders: the route's class strings decoded into the
  // data attributes, so the timeline root carries no per-item classes and the
  // variant utilities are all `group-data-[…]` matches on this value.
  @property({ reflect: false, attribute: false })
  rows = computed(() =>
    this.timeline.map((row) => ({
      ...row,
      state: row.rowClass.slice('tl-row tl-'.length),
      stampKind: row.stampClass.slice('stamp stamp-'.length),
    })),
  ) as CompiledComputed<RoadmapRow[]>;
  @property({ reflect: false, attribute: false })
  designRuleTitle = '';
  @property({ reflect: false, attribute: false })
  designRuleText = '';
  @property({ reflect: false, attribute: false })
  boundaryIndex = '';
  @property({ reflect: false, attribute: false })
  boundaryTitle = '';
  @property({ reflect: false, attribute: false })
  boundaryCopy = '';
  @property({ reflect: false, attribute: false })
  inProductLabel = '';
  @property({ reflect: false, attribute: false })
  inProductTitle = '';
  @property({ reflect: false, attribute: false })
  inProductItems: RoadmapListItem[] = [];
  @property({ reflect: false, attribute: false })
  outScopeLabel = '';
  @property({ reflect: false, attribute: false })
  outScopeTitle = '';
  @property({ reflect: false, attribute: false })
  outScopeItems: RoadmapListItem[] = [];
  @property({ reflect: false, attribute: false })
  siteRuleLabel = '';
  @property({ reflect: false, attribute: false })
  siteRuleTitle = '';
  @property({ reflect: false, attribute: false })
  siteRuleText = '';
  @property({ reflect: false, attribute: false })
  matrixIndex = '';
  @property({ reflect: false, attribute: false })
  matrixTitle = '';
  @property({ reflect: false, attribute: false })
  matrixCopy = '';
  @property({ reflect: false, attribute: false })
  shipLabel = '';
  @property({ reflect: false, attribute: false })
  shipCopy = '';
  @property({ reflect: false, attribute: false })
  proveLabel = '';
  @property({ reflect: false, attribute: false })
  proveCopy = '';
  @property({ reflect: false, attribute: false })
  freezeLabel = '';
  @property({ reflect: false, attribute: false })
  freezeCopy = '';
  @property({ reflect: false, attribute: false })
  visualIndex = '';
  @property({ reflect: false, attribute: false })
  visualTitle = '';
  @property({ reflect: false, attribute: false })
  visualCopy = '';
  @property({ reflect: false, attribute: false })
  packageMatrixLabel = '';
  @property({ reflect: false, attribute: false })
  productBoundaryMeta = '';
  @property({ reflect: false, attribute: false })
  releaseDisciplineLabel = '';
  @property({ reflect: false, attribute: false })
  v10PostureMeta = '';
  @property({ reflect: false, attribute: false })
  noDriftLabel = '';
  @property({ reflect: false, attribute: false })
  noDriftCopy = '';
  @property({ reflect: false, attribute: false })
  noGhostsLabel = '';
  @property({ reflect: false, attribute: false })
  noGhostsCopy = '';
  @property({ reflect: false, attribute: false })
  noFogLabel = '';
  @property({ reflect: false, attribute: false })
  noFogCopy = '';
  @property({ reflect: false, attribute: false })
  architecture = '';
  @property({ reflect: false, attribute: false })
  changelog = '';
  @property({ reflect: false, attribute: false })
  deployment = '';

  // Same base-field redeclaration as open-layout: the compiled @property
  // shadows OpenElementConfiguration.locale (SSR injection or the `locale`
  // attribute); tsc's `override` demand is rejected by the compiled grammar.
  @property({ reflect: false })
  // @ts-expect-error compiled @property shadows the optional base field
  locale = 'en';

  render() {
    return (
      <div data-pagefind-body>
        <open-reading-shell rail footer metadata={this.metadata} locale={this.locale}>
          <div slot='rail'>
            <open-page-rail items={this.railItems} locale={this.locale}></open-page-rail>
          </div>

          <section id='release-line'>
            <open-section-frame>
              <span slot='index'>{this.releaseLineIndex}</span>
              <span slot='title'>{this.releaseLineTitle}</span>
              <span slot='copy'>{this.releaseLineCopy}</span>
              <div class='mt-5 mb-6 px-5 py-4 border border-border border-s-4 border-s-primary rounded-lg'>
                {/* Retired ui open-badge → plain HTML+CSS recipe (#1557): the
                    warning-tone wash the component painted, inline. */}
                <span>{this.freezeBadge}</span>
                <p class='mt-3 mb-2 text-foreground font-bold leading-[1.3]'>{this.nowTitle}</p>
                <p class='m-0 text-muted-foreground text-(length:--text-sm) leading-(--leading-normal)'>
                  {this.nowCopy}
                </p>
              </div>
              <div class='grid grid-cols-[minmax(0,1fr)] gap-[clamp(2rem,6vw,5rem)] [align-items:start] min-[1121px]:grid-cols-[minmax(0,1fr)_minmax(280px,0.38fr)]'>
                <div class='timeline relative grid' aria-label={this.timelineAria}>
                  {this.rows.map((phase) => (
                    <div
                      class='group relative pt-5 pb-5 ps-6 min-[641px]:ps-8'
                      data-state={phase.state}
                      data-stamp={phase.stampKind}
                      key={phase.key}
                    >
                      <span
                        class='tl-node absolute start-0 top-8 size-2 group-data-[state=stable]:bg-primary group-data-[state=baseline]:bg-primary group-data-[state=next]:border-2 group-data-[state=next]:border-primary group-data-[state=next]:bg-background group-data-[state=planned]:border-2 group-data-[state=planned]:border-[color-mix(in_srgb,var(--color-ring)_55%,transparent)]'
                        aria-hidden='true'
                      ></span>
                      <div class='flex flex-wrap items-baseline gap-x-4 gap-y-3'>
                        <span class='text-foreground text-[length:clamp(2rem,4.2vw,3.6rem)] font-[800] leading-none tracking-[-0.03em] group-data-[state=next]:text-primary group-data-[state=planned]:text-transparent group-data-[state=planned]:[-webkit-text-stroke:1.5px_color-mix(in_srgb,var(--color-ring)_55%,transparent)]'>
                          {phase.version}
                        </span>
                        <span class='px-3 py-1 rounded-md text-(length:--text-xs) font-bold tracking-[0.08em] uppercase empty:hidden group-data-[stamp=current]:bg-primary group-data-[stamp=current]:text-primary-foreground group-data-[stamp=next]:border group-data-[stamp=next]:border-primary group-data-[stamp=next]:text-primary group-data-[stamp=baseline]:bg-primary group-data-[stamp=baseline]:text-primary-foreground'>
                          {phase.stampLabel}
                        </span>
                        <span class='text-primary font-serif text-[length:clamp(1.25rem,1.9vw,1.7rem)] italic font-[400] group-data-[state=planned]:text-ring'>
                          {phase.theme}
                        </span>
                      </div>
                      <p class='text-muted-foreground text-(length:--text-sm) leading-(--leading-normal) max-w-[560px] mt-3 mb-0'>
                        {phase.copy}
                      </p>
                      <span class='text-muted-foreground text-(length:--text-xs) tracking-[0.1em] uppercase empty:hidden'>
                        {phase.status}
                      </span>
                    </div>
                  ))}
                </div>
                <aside class='p-5 static min-[1121px]:sticky top-[calc(var(--nav-height)_+_calc(var(--spacing)*6))] border border-[color-mix(in_srgb,var(--color-ring)_45%,transparent)] rounded-lg bg-primary-foreground shadow-[inset_calc(var(--spacing)*1)_0_0_var(--color-primary)]'>
                  <p class='text-primary font-mono text-(length:--text-xs) font-extrabold tracking-normal uppercase mb-3'>
                    {this.designRuleTitle}
                  </p>
                  <p class='text-muted-foreground text-(length:--text-sm) leading-(--leading-normal) mb-0'>
                    {this.designRuleText}
                  </p>
                </aside>
              </div>
            </open-section-frame>
          </section>

          <section id='product-boundary'>
            <open-section-frame>
              <span slot='index'>{this.boundaryIndex}</span>
              <span slot='title'>{this.boundaryTitle}</span>
              <span slot='copy'>{this.boundaryCopy}</span>
              <div class='grid grid-cols-[minmax(0,1fr)] gap-5 min-[1121px]:grid-cols-[minmax(0,0.95fr)_minmax(0,0.95fr)_minmax(0,0.72fr)]'>
                <open-artifact-panel class='truth'>
                  <span slot='label'>{this.inProductLabel}</span>
                  <h2 class='mt-0 mb-4 text-foreground text-(length:--text-2xl) leading-[1.08] tracking-normal'>
                    {this.inProductTitle}
                  </h2>
                  <ul class='grid gap-2 m-0 ps-5'>
                    {this.inProductItems.map((item) => (
                      <li
                        class='text-muted-foreground text-(length:--text-sm) leading-(--leading-normal)'
                        key={item.key}
                      >
                        {item.value}
                      </li>
                    ))}
                  </ul>
                </open-artifact-panel>

                <open-artifact-panel class='truth'>
                  <span slot='label'>{this.outScopeLabel}</span>
                  <h2 class='mt-0 mb-4 text-foreground text-(length:--text-2xl) leading-[1.08] tracking-normal'>
                    {this.outScopeTitle}
                  </h2>
                  <ul class='grid gap-2 m-0 ps-5'>
                    {this.outScopeItems.map((item) => (
                      <li
                        class='text-muted-foreground text-(length:--text-sm) leading-(--leading-normal)'
                        key={item.key}
                      >
                        {item.value}
                      </li>
                    ))}
                  </ul>
                </open-artifact-panel>

                <open-artifact-panel class='truth'>
                  <span slot='label'>{this.siteRuleLabel}</span>
                  <h2 class='mt-0 mb-4 text-foreground text-(length:--text-2xl) leading-[1.08] tracking-normal'>
                    {this.siteRuleTitle}
                  </h2>
                  <p class='text-muted-foreground text-(length:--text-sm) leading-(--leading-normal)'>
                    {this.siteRuleText}
                  </p>
                </open-artifact-panel>
              </div>
            </open-section-frame>
          </section>

          <section id='decision-matrix'>
            <open-section-frame>
              <span slot='index'>{this.matrixIndex}</span>
              <span slot='title'>{this.matrixTitle}</span>
              <span slot='copy'>{this.matrixCopy}</span>
              <div class='grid border-t border-t-border'>
                <div class='grid grid-cols-[minmax(0,1fr)] gap-2 py-5 border-b border-b-border min-[641px]:grid-cols-[minmax(132px,0.28fr)_minmax(0,1fr)] min-[641px]:gap-5 last:[border-bottom:0]'>
                  <span class='text-primary font-mono text-(length:--text-xs) font-extrabold tracking-normal uppercase'>
                    {this.shipLabel}
                  </span>
                  <span class='text-muted-foreground text-(length:--text-sm) leading-(--leading-normal)'>
                    {this.shipCopy}
                  </span>
                </div>
                <div class='grid grid-cols-[minmax(0,1fr)] gap-2 py-5 border-b border-b-border min-[641px]:grid-cols-[minmax(132px,0.28fr)_minmax(0,1fr)] min-[641px]:gap-5 last:[border-bottom:0]'>
                  <span class='text-primary font-mono text-(length:--text-xs) font-extrabold tracking-normal uppercase'>
                    {this.proveLabel}
                  </span>
                  <span class='text-muted-foreground text-(length:--text-sm) leading-(--leading-normal)'>
                    {this.proveCopy}
                  </span>
                </div>
                <div class='grid grid-cols-[minmax(0,1fr)] gap-2 py-5 border-b border-b-border min-[641px]:grid-cols-[minmax(132px,0.28fr)_minmax(0,1fr)] min-[641px]:gap-5 last:[border-bottom:0]'>
                  <span class='text-primary font-mono text-(length:--text-xs) font-extrabold tracking-normal uppercase'>
                    {this.freezeLabel}
                  </span>
                  <span class='text-muted-foreground text-(length:--text-sm) leading-(--leading-normal)'>
                    {this.freezeCopy}
                  </span>
                </div>
              </div>
            </open-section-frame>
          </section>

          <section id='system-visual'>
            <open-section-frame>
              <span slot='index'>{this.visualIndex}</span>
              <span slot='title'>{this.visualTitle}</span>
              <span slot='copy'>{this.visualCopy}</span>
              <div class='grid grid-cols-[minmax(0,1fr)] gap-5 min-[1121px]:grid-cols-[minmax(0,0.88fr)_minmax(0,1fr)]'>
                <open-artifact-panel>
                  <span slot='label'>{this.packageMatrixLabel}</span>
                  <span slot='meta'>{this.productBoundaryMeta}</span>
                  <open-standards-visual
                    variant='packages'
                    emphasis='high'
                    motion='auto'
                  ></open-standards-visual>
                </open-artifact-panel>
                <open-artifact-panel>
                  <span slot='label'>{this.releaseDisciplineLabel}</span>
                  <span slot='meta'>{this.v10PostureMeta}</span>
                  <ul class='grid gap-2 m-0 p-0 list-none'>
                    <li class='grid grid-cols-[minmax(0,1fr)] gap-2 py-4 border-b border-b-border min-[641px]:grid-cols-[minmax(110px,0.32fr)_minmax(0,1fr)] min-[641px]:gap-4 last:[border-bottom:0]'>
                      <strong class='text-primary font-mono text-(length:--text-xs) font-extrabold tracking-normal uppercase'>
                        {this.noDriftLabel}
                      </strong>
                      <span class='text-muted-foreground text-(length:--text-sm) leading-(--leading-normal)'>
                        {this.noDriftCopy}
                      </span>
                    </li>
                    <li class='grid grid-cols-[minmax(0,1fr)] gap-2 py-4 border-b border-b-border min-[641px]:grid-cols-[minmax(110px,0.32fr)_minmax(0,1fr)] min-[641px]:gap-4 last:[border-bottom:0]'>
                      <strong class='text-primary font-mono text-(length:--text-xs) font-extrabold tracking-normal uppercase'>
                        {this.noGhostsLabel}
                      </strong>
                      <span class='text-muted-foreground text-(length:--text-sm) leading-(--leading-normal)'>
                        {this.noGhostsCopy}
                      </span>
                    </li>
                    <li class='grid grid-cols-[minmax(0,1fr)] gap-2 py-4 border-b border-b-border min-[641px]:grid-cols-[minmax(110px,0.32fr)_minmax(0,1fr)] min-[641px]:gap-4 last:[border-bottom:0]'>
                      <strong class='text-primary font-mono text-(length:--text-xs) font-extrabold tracking-normal uppercase'>
                        {this.noFogLabel}
                      </strong>
                      <span class='text-muted-foreground text-(length:--text-sm) leading-(--leading-normal)'>
                        {this.noFogCopy}
                      </span>
                    </li>
                  </ul>
                </open-artifact-panel>
              </div>
            </open-section-frame>
          </section>

          <nav
            class='flex flex-wrap gap-3 w-[min(1180px,calc(100%_-_3rem))] mt-[clamp(4rem,10vh,8rem)] mx-auto mb-0 pb-[clamp(3rem,8vh,6rem)]'
            slot='footer'
          >
            <open-button href='/architecture'>{this.architecture}</open-button>
            <open-button href='/changelog'>{this.changelog}</open-button>
            <open-button href='/guide/deployment'>{this.deployment}</open-button>
          </nav>
        </open-reading-shell>
      </div>
    );
  }
}
