import { element, OpenElement, property } from '@openelement/element';
import '@openelement/ui/open-button';
import page404Styles from './page-404.css';

@element('el-404')
export default class Page404 extends OpenElement {
  static override styles = [page404Styles];

  @property({ reflect: false })
  serifLine = '';

  @property({ reflect: false })
  lede = '';

  @property({ reflect: false })
  backHome = '';

  @property({ reflect: false })
  readDocs = '';

  @property({ reflect: false })
  homeHref = '/';

  @property({ reflect: false })
  docsHref = '/docs';

  @property({ reflect: false })
  searchHint = '';

  @property({ reflect: false })
  popularLabel = '';

  @property({ reflect: false })
  popular: Array<{ href: string; label: string }> = [];

  @property({ reflect: false })
  suggestionsLabel = '';

  @property({ reflect: false })
  suggestions: Array<{ href: string; label: string }> = [];

  @property({ reflect: false })
  marqueeText = '';

  render() {
    return (
      <div class='bg-background text-foreground' data-pagefind-ignore>
        <section class='stage relative isolate grid min-h-[calc(100svh-var(--nav-height)-calc(var(--spacing)*12))] content-center justify-items-center gap-5 px-6 py-[clamp(3rem,8vh,6rem)] text-center'>
          <h1
            class='code m-0 flex font-mono text-[clamp(9rem,26vw,24rem)] leading-[0.9] font-extrabold tracking-[-0.06em] text-transparent select-none'
            aria-label='404'
          >
            <span aria-hidden='true'>4</span>
            <span class='solid text-foreground' aria-hidden='true'>
              {'0'}
            </span>
            <span aria-hidden='true'>4</span>
          </h1>
          <p class='serif-line m-0 font-serif text-[clamp(2rem,5vw,4rem)] font-normal italic tracking-[-0.01em] text-primary'>
            {this.serifLine}
          </p>
          <p class='lede m-0 max-w-[34rem] font-mono text-sm leading-[1.75] text-muted-foreground'>
            {this.lede}
          </p>
          {/* Static component, deliberately not an island: a 404-only
              island chunk homed shared framework modules and got imported
              by every page's chunks (measured +22KB on /) — the header
              search and ⌘K already hydrate here, so a dedicated control
              is not worth a site-wide tax. */}
          <div class='mt-3 flex flex-wrap justify-center gap-3'>
            <open-button variant='primary' href={this.homeHref}>
              {this.backHome}
            </open-button>
            <open-button href={this.docsHref}>{this.readDocs}</open-button>
          </div>
          <p class='search-hint m-0 font-mono text-xs text-muted-foreground'>{this.searchHint}</p>
          <nav
            class='popular mt-2 flex flex-wrap items-baseline justify-center gap-x-4 gap-y-2'
            aria-labelledby='popular-heading'
          >
            <p
              class='popular-label m-0 font-mono text-xs tracking-[0.12em] text-muted-foreground uppercase'
              id='popular-heading'
            >
              {this.popularLabel}
            </p>
            {this.popular.map((link) => (
              <a
                class='font-mono text-sm text-muted-foreground no-underline hover:text-primary hover:underline'
                key={link.href}
                href={link.href}
              >
                {link.label}
              </a>
            ))}
          </nav>
          <nav
            class='popular mt-2 flex flex-wrap items-baseline justify-center gap-x-4 gap-y-2'
            aria-labelledby='suggestions-heading'
          >
            <p
              class='popular-label m-0 font-mono text-xs tracking-[0.12em] text-muted-foreground uppercase'
              id='suggestions-heading'
            >
              {this.suggestionsLabel}
            </p>
            {this.suggestions.map((link) => (
              <a
                class='font-mono text-sm text-muted-foreground no-underline hover:text-primary hover:underline'
                key={link.href}
                href={link.href}
              >
                {link.label}
              </a>
            ))}
          </nav>
        </section>
        <div
          class='marquee overflow-hidden border-y border-border bg-(--surface-1) whitespace-nowrap'
          aria-hidden='true'
        >
          <span class='inline-block py-3 font-mono text-sm font-medium tracking-[0.12em] text-primary'>
            {this.marqueeText}
          </span>
        </div>
      </div>
    );
  }
}
