import {
  element,
  OpenElement,
  property,
  type TrustedHtml,
  trustedHtml,
} from '@openelement/element';
import '@openelement/ui/open-button';
import '#site-ui/open-reading-shell.tsx';
import '../islands/open-page-rail.tsx';
import pageChangelogStyles from './page-changelog.css';
import '#site-ui/open-artifact-panel.tsx';

interface ChangelogRailItem {
  id: string;
  href: string;
  label: string;
  depth: string;
}

@element('changelog-page')
export default class PageChangelog extends OpenElement {
  static override styles = [pageChangelogStyles];

  @property({ reflect: false, attribute: false })
  eyebrow = '';
  @property({ reflect: false, attribute: false })
  pageTitle = '';
  @property({ reflect: false, attribute: false })
  lede = '';
  @property({ reflect: false, attribute: false })
  metaPrefix = '';
  @property({ reflect: false, attribute: false })
  registryNote = '';
  @property({ reflect: false, attribute: false })
  metaSuffix = '';
  @property({ reflect: false, attribute: false })
  railItems: ChangelogRailItem[] = [];
  @property({ reflect: false, attribute: false })
  publishedIntro = '';
  @property({ reflect: false, attribute: false })
  stampCurrent = '';
  @property({ reflect: false, attribute: false })
  regCurrentSummary = '';
  @property({ reflect: false, attribute: false })
  stableHeading = '';
  @property({ reflect: false, attribute: false })
  commonVersionLabel = '';
  @property({ reflect: false, attribute: false })
  stableBody = '';
  @property({ reflect: false, attribute: false })
  withdrawnHeading = '';
  @property({ reflect: false, attribute: false })
  withdrawnBody = '';
  @property({ reflect: false, attribute: false })
  footnote = '';
  @property({ type: Object, reflect: false, attribute: false })
  changelogHtml: TrustedHtml = trustedHtml('');
  @property({ reflect: false, attribute: false })
  roadmapHref = '';
  @property({ reflect: false, attribute: false })
  roadmapLabel = '';
  @property({ reflect: false, attribute: false })
  gettingStartedHref = '';
  @property({ reflect: false, attribute: false })
  gettingStartedLabel = '';

  // Same base-field redeclaration as open-layout: the compiled @property
  // shadows OpenElementConfiguration.locale (SSR injection or the `locale`
  // attribute); tsc's `override` demand is rejected by the compiled grammar.
  @property({ reflect: false })
  // @ts-expect-error compiled @property shadows the optional base field
  locale = 'en';

  render() {
    return (
      <div data-pagefind-body>
        <open-reading-shell meta rail footer locale={this.locale}>
          <div slot='meta'>
            <p class='mb-4 flex flex-wrap items-baseline gap-2 font-mono text-(length:--text-xs) leading-[1.72] font-extrabold tracking-[0.1em] text-muted-foreground uppercase'>
              <span>Project</span>
              <span>/</span>
              <span class='text-primary'>{this.eyebrow}</span>
            </p>
            <h1 class='m-0 font-sans text-[clamp(2.1rem,4.6vw,3.4rem)] leading-[1.05] font-extrabold tracking-[-0.035em] wrap-break-word text-balance text-foreground'>
              {this.pageTitle}
            </h1>
            <p class='mt-4 max-w-[640px] text-[clamp(var(--text-base),1.4vw,var(--text-xl))] leading-[1.65] text-muted-foreground'>
              {this.lede}
            </p>
            <p class='mt-4 text-(length:--text-sm) leading-[1.72] text-muted-foreground'>
              {this.metaPrefix}{' '}
              <code class='rounded-md border border-[color-mix(in_srgb,var(--color-primary)_18%,var(--color-border))] bg-muted px-2 py-1 font-mono text-(length:--text-xs) text-primary'>
                {this.registryNote}
              </code>
              {this.metaSuffix}
            </p>
          </div>
          <div slot='rail'>
            <open-page-rail items={this.railItems} locale={this.locale}></open-page-rail>
          </div>
          <p
            id='published'
            class='my-2 text-sm leading-[1.72] text-foreground min-[901px]:text-(length:--text-base)'
          >
            {this.publishedIntro}
          </p>
          <div class='mt-8 mb-10 border-t border-border' aria-label='Release register'>
            <div class='border-b border-border bg-primary/14 p-5 shadow-[inset_4px_0_0_var(--color-primary)]'>
              <div class='flex flex-wrap items-baseline gap-3'>
                <span class='text-[clamp(1.9rem,3.4vw,2.8rem)] leading-none font-extrabold tracking-[-0.02em] text-foreground'>
                  {this.commonVersionLabel}
                </span>
                <span class='rounded-md bg-primary px-3 py-1 text-(length:--text-xs) font-bold tracking-[0.08em] text-primary-foreground uppercase'>
                  {this.stampCurrent}
                </span>
              </div>
              <p class='mt-2 max-w-[640px] truncate text-(length:--text-xs) leading-normal text-muted-foreground'>
                {this.regCurrentSummary}
              </p>
            </div>
          </div>
          <section id='candidate'>
            <h2 class='mt-10 mb-4 border-b border-b-border pb-2 text-(length:--text-2xl) leading-[1.12] font-extrabold text-foreground min-[481px]:text-(length:--text-4xl) min-[901px]:text-(length:--text-5xl)'>
              {this.stableHeading}
            </h2>
            <p class='my-2 text-sm leading-[1.72] text-foreground min-[901px]:text-(length:--text-base)'>
              {this.stableBody}
            </p>
          </section>
          <section id='withdrawn'>
            <h2 class='mt-10 mb-4 border-b border-b-border pb-2 text-(length:--text-2xl) leading-[1.12] font-extrabold text-foreground min-[481px]:text-(length:--text-4xl) min-[901px]:text-(length:--text-5xl)'>
              {this.withdrawnHeading}
            </h2>
            <p class='my-2 text-sm leading-[1.72] text-foreground min-[901px]:text-(length:--text-base)'>
              {this.withdrawnBody}
            </p>
          </section>
          <p class='my-2 text-(length:--text-xs) leading-[1.72] text-muted-foreground'>
            {this.footnote}
          </p>
          <div
            id='historical'
            class='changelog-content'
            innerHTML={this.changelogHtml}
            trustedHtml
          />
          <div
            slot='footer'
            class='mt-10 flex flex-col justify-between gap-3 border-t border-border pt-4 min-[901px]:flex-row'
          >
            <open-button class='no-underline' variant='ghost' size='sm' href={this.roadmapHref}>
              {this.roadmapLabel}
            </open-button>
            <open-button
              class='no-underline'
              variant='ghost'
              size='sm'
              href={this.gettingStartedHref}
            >
              {this.gettingStartedLabel}
            </open-button>
          </div>
        </open-reading-shell>
      </div>
    );
  }
}
