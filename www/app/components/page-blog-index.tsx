import { element, OpenElement, property } from '@openelement/element';
import pageBlogIndexStyles from './page-blog-index.css';
import '#site-ui/open-reading-shell.tsx';
import '#site-ui/open-artifact-panel.tsx';
import '../islands/open-page-rail.tsx';

interface BlogIndexRow {
  slug: string;
  href: string;
  index: string;
  title: string;
  excerpt: string;
  date: string;
  langLabel: string;
}

@element('blog-index')
export default class BlogIndexPage extends OpenElement {
  static override styles = [pageBlogIndexStyles];

  @property({ reflect: false, attribute: false })
  featuredHref = '';
  @property({ reflect: false, attribute: false })
  featuredKicker = '';
  @property({ reflect: false, attribute: false })
  featuredTitle = '';
  @property({ reflect: false, attribute: false })
  featuredExcerpt = '';
  @property({ reflect: false, attribute: false })
  rows: BlogIndexRow[] = [];

  @property({ reflect: false, attribute: false })
  mastheadEyebrow = '';
  @property({ reflect: false, attribute: false })
  mastheadTitle = '';
  @property({ reflect: false, attribute: false })
  mastheadLede = '';
  @property({ reflect: false, attribute: false })
  originNote = '';
  @property({ reflect: false, attribute: false })
  latestLabel = '';
  @property({ reflect: false, attribute: false })
  readMoreLabel = '';
  @property({ reflect: false, attribute: false })
  streamLabel = '';

  render() {
    return (
      <div data-pagefind-body>
        <header class='masthead relative isolate px-[clamp(1.5rem,5vw,4.5rem)] pt-[clamp(4rem,11vh,8rem)] pb-[clamp(2.5rem,6vh,4.5rem)]'>
          <p class='eyebrow flex items-center gap-3 text-primary font-mono text-(length:--text-xs) font-extrabold tracking-[0.29em] uppercase [&:lang(zh)]:normal-case [&:lang(zh)]:tracking-[0.08em]'>
            {this.mastheadEyebrow}
          </p>
          <h1 class='mt-[clamp(1.5rem,4vh,3rem)] font-serif italic font-normal text-[clamp(4.2rem,13vw,11rem)] leading-[0.92] tracking-[-0.02em] text-primary'>
            {this.mastheadTitle}
          </h1>
          <p class='max-w-[38rem] mt-[clamp(1.25rem,3vh,2rem)] text-muted-foreground text-[clamp(1rem,1.2vw,1.1rem)] leading-[1.75]'>
            {this.mastheadLede}
          </p>
          <p class='max-w-[38rem] mt-3 font-mono text-(length:--text-xs) leading-[1.75] text-muted-foreground empty:hidden'>
            {this.originNote}
          </p>
        </header>

        <a
          class='group block border-y border-border bg-[color-mix(in_srgb,var(--color-popover)_55%,var(--color-background))] px-[clamp(1.5rem,5vw,4.5rem)] py-[clamp(2.5rem,6vh,4.5rem)] text-inherit no-underline'
          href={this.featuredHref}
        >
          <p class='flex flex-wrap items-baseline gap-3 text-primary font-mono text-(length:--text-xs) font-extrabold tracking-[0.16em] uppercase'>
            <span>{this.featuredKicker}</span>
            <span class='ms-auto text-muted-foreground font-medium tracking-[0.08em]'>
              {this.latestLabel}
            </span>
          </p>
          <h2 class='max-w-[20ch] mt-5 font-serif font-normal text-[clamp(2.4rem,5.5vw,4.6rem)] leading-none tracking-[-0.01em] text-foreground transition-[color] duration-150 ease-[ease] group-hover:text-primary'>
            {this.featuredTitle}
          </h2>
          <p class='max-w-[44rem] mt-4 font-mono text-(length:--text-sm) leading-[1.75] text-muted-foreground empty:hidden'>
            {this.featuredExcerpt}
          </p>
          <span class='inline-block mt-5 text-primary font-mono text-(length:--text-sm) font-bold'>
            {this.readMoreLabel}
          </span>
        </a>

        <section class='grid pb-[clamp(3rem,8vh,6rem)]' aria-label={this.streamLabel}>
          {this.rows.map((row) => (
            <a
              class='group grid grid-cols-[minmax(0,1fr)] gap-2 border-b border-border px-[clamp(1.5rem,5vw,4.5rem)] py-[clamp(1.5rem,4vh,2.75rem)] text-inherit no-underline transition-[background] duration-150 ease-[ease] hover:bg-[linear-gradient(90deg,color-mix(in_srgb,var(--color-primary)_8%,transparent),transparent)] min-[721px]:grid-cols-[minmax(4rem,0.14fr)_minmax(0,1fr)_auto] min-[721px]:gap-[clamp(1rem,4vw,4rem)]'
              key={row.slug}
              href={row.href}
            >
              <span
                class='font-mono text-[clamp(2.4rem,5vw,4rem)] font-[800] leading-none text-transparent [-webkit-text-stroke:1.5px_color-mix(in_srgb,var(--color-ring)_55%,transparent)]'
                aria-hidden='true'
              >
                {row.index}
              </span>
              <div>
                <span class='block font-serif font-normal text-[clamp(1.6rem,3vw,2.6rem)] leading-[1.05] text-foreground transition-[color] duration-150 ease-[ease] group-hover:text-primary'>
                  {row.title}
                </span>
                <span class='inline-block px-2 py-0 mt-2 border border-[color-mix(in_srgb,var(--color-ring)_45%,transparent)] rounded-md text-muted-foreground font-mono text-(length:--text-xs) tracking-[0.08em] empty:hidden'>
                  {row.langLabel}
                </span>
                <p class='mt-2 text-muted-foreground font-mono text-(length:--text-xs) leading-[1.6] empty:hidden'>
                  {row.excerpt}
                </p>
              </div>
              <span class='text-muted-foreground font-mono text-(length:--text-xs) whitespace-nowrap justify-self-start min-[721px]:justify-self-auto'>
                {row.date}
              </span>
            </a>
          ))}
        </section>
      </div>
    );
  }
}
