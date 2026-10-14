import { element, OpenElement, property } from '@openelement/element';
import pageDocsStyles from './page-docs.css';
import '#site-ui/open-reading-shell.tsx';
import '#site-ui/open-artifact-panel.tsx';
import '../islands/open-page-rail.tsx';

@element('docs-index')
export default class PageDocs extends OpenElement {
  static override styles = [pageDocsStyles];

  @property({ reflect: false, attribute: false })
  sidenote = '';
  @property({ reflect: false, attribute: false })
  eyebrow = '';
  @property({ reflect: false, attribute: false })
  serifLine = '';
  @property({ reflect: false, attribute: false })
  monoLine = '';
  @property({ reflect: false, attribute: false })
  lede = '';
  @property({ reflect: false, attribute: false })
  navLabel = '';
  @property({ reflect: false, attribute: false })
  version = '';
  @property({ reflect: false, attribute: false })
  entrance1Title = '';
  @property({ reflect: false, attribute: false })
  entrance1Copy = '';
  @property({ reflect: false, attribute: false })
  entrance1Href = '';
  @property({ reflect: false, attribute: false })
  entrance2Title = '';
  @property({ reflect: false, attribute: false })
  entrance2Copy = '';
  @property({ reflect: false, attribute: false })
  entrance2Href = '';
  @property({ reflect: false, attribute: false })
  entrance3Title = '';
  @property({ reflect: false, attribute: false })
  entrance3Copy = '';
  @property({ reflect: false, attribute: false })
  entrance3Href = '';
  @property({ reflect: false, attribute: false })
  entrance4Title = '';
  @property({ reflect: false, attribute: false })
  entrance4Copy = '';
  @property({ reflect: false, attribute: false })
  entrance4Href = '';
  @property({ reflect: false, attribute: false })
  entrance5Title = '';
  @property({ reflect: false, attribute: false })
  entrance5Copy = '';
  @property({ reflect: false, attribute: false })
  entrance5Href = '';

  render() {
    return (
      <div class='bg-background text-foreground' data-pagefind-body>
        <header class='masthead relative isolate px-[clamp(1.5rem,5vw,4.5rem)] pt-[clamp(4rem,11vh,8rem)] pb-[clamp(2.5rem,6vh,4.5rem)]'>
          <span
            class='absolute right-[clamp(0.5rem,1.5vw,1.5rem)] bottom-[clamp(1rem,4vh,2.5rem)] hidden font-mono text-(length:--font-size-micro) tracking-[0.2em] text-muted-foreground uppercase select-none [writing-mode:vertical-rl] min-[721px]:block'
            aria-hidden='true'
          >
            {this.sidenote}
          </span>
          <div class='flex items-baseline justify-between gap-4'>
            <p class='eyebrow m-0 flex items-center gap-3 font-mono text-(length:--text-xs) font-extrabold tracking-[0.29em] text-primary uppercase [&:lang(zh)]:normal-case [&:lang(zh)]:tracking-[0.08em]'>
              {this.eyebrow}
            </p>
            <span class='font-mono text-(length:--text-xs) tracking-[0.08em] text-muted-foreground uppercase'>
              {this.version}
            </span>
          </div>
          <h1 class='mt-[clamp(1.5rem,4vh,3rem)] mb-0 leading-[0.92]'>
            <span class='block font-serif text-[length:clamp(3.4rem,9vw,8rem)] font-normal tracking-[-0.02em] text-primary italic'>
              {this.serifLine}
            </span>{' '}
            <span class='block font-mono text-[length:clamp(3rem,8vw,7rem)] font-extrabold tracking-[-0.05em] text-foreground'>
              {this.monoLine}
            </span>
          </h1>
          <p class='mt-[clamp(1.25rem,3vh,2rem)] mb-0 max-w-[34rem] font-mono text-[length:clamp(1rem,1.2vw,1.1rem)] leading-[1.75] text-muted-foreground'>
            {this.lede}
          </p>
        </header>
        <nav class='grid border-t border-border' aria-label={this.navLabel}>
          <a
            class='group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-[clamp(1rem,4vw,4rem)] border-b border-border px-[clamp(1.5rem,5vw,4.5rem)] py-[clamp(1.25rem,3.5vh,2.5rem)] text-inherit no-underline transition-[background] duration-150 ease-[ease] hover:bg-[linear-gradient(90deg,color-mix(in_srgb,var(--color-primary)_8%,transparent),transparent)] min-[721px]:grid-cols-[minmax(5rem,0.16fr)_minmax(0,1fr)_auto]'
            href={this.entrance1Href}
          >
            <span
              class='hidden font-mono text-[length:clamp(3rem,7vw,6rem)] font-extrabold leading-none text-transparent transition-[-webkit-text-stroke-color] duration-150 ease-[ease] [-webkit-text-stroke:1.5px_color-mix(in_srgb,var(--color-ring)_55%,transparent)] group-hover:[-webkit-text-stroke-color:var(--color-primary)] min-[721px]:block'
              aria-hidden='true'
            >
              {'01'}
            </span>
            <div>
              <span class='block font-mono text-[length:clamp(1.5rem,2.8vw,2.4rem)] font-extrabold leading-[1.05] tracking-[-0.02em] text-foreground transition-[color] duration-150 ease-[ease] group-hover:text-primary'>
                {this.entrance1Title}
              </span>
              <p class='mt-2 mb-0 font-mono text-(length:--text-xs) leading-[1.6] text-muted-foreground'>
                {this.entrance1Copy}
              </p>
            </div>
            <span
              class='font-mono text-(length:--text-5xl) text-ring transition-[transform,color] duration-150 ease-[ease] group-hover:translate-x-2 group-hover:text-primary'
              aria-hidden='true'
            >
              {'→'}
            </span>
          </a>
          <a
            class='group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-[clamp(1rem,4vw,4rem)] border-b border-border px-[clamp(1.5rem,5vw,4.5rem)] py-[clamp(1.25rem,3.5vh,2.5rem)] text-inherit no-underline transition-[background] duration-150 ease-[ease] hover:bg-[linear-gradient(90deg,color-mix(in_srgb,var(--color-primary)_8%,transparent),transparent)] min-[721px]:grid-cols-[minmax(5rem,0.16fr)_minmax(0,1fr)_auto]'
            href={this.entrance2Href}
          >
            <span
              class='hidden font-mono text-[length:clamp(3rem,7vw,6rem)] font-extrabold leading-none text-transparent transition-[-webkit-text-stroke-color] duration-150 ease-[ease] [-webkit-text-stroke:1.5px_color-mix(in_srgb,var(--color-ring)_55%,transparent)] group-hover:[-webkit-text-stroke-color:var(--color-primary)] min-[721px]:block'
              aria-hidden='true'
            >
              {'02'}
            </span>
            <div>
              <span class='block font-mono text-[length:clamp(1.5rem,2.8vw,2.4rem)] font-extrabold leading-[1.05] tracking-[-0.02em] text-foreground transition-[color] duration-150 ease-[ease] group-hover:text-primary'>
                {this.entrance2Title}
              </span>
              <p class='mt-2 mb-0 font-mono text-(length:--text-xs) leading-[1.6] text-muted-foreground'>
                {this.entrance2Copy}
              </p>
            </div>
            <span
              class='font-mono text-(length:--text-5xl) text-ring transition-[transform,color] duration-150 ease-[ease] group-hover:translate-x-2 group-hover:text-primary'
              aria-hidden='true'
            >
              {'→'}
            </span>
          </a>
          <a
            class='group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-[clamp(1rem,4vw,4rem)] border-b border-border px-[clamp(1.5rem,5vw,4.5rem)] py-[clamp(1.25rem,3.5vh,2.5rem)] text-inherit no-underline transition-[background] duration-150 ease-[ease] hover:bg-[linear-gradient(90deg,color-mix(in_srgb,var(--color-primary)_8%,transparent),transparent)] min-[721px]:grid-cols-[minmax(5rem,0.16fr)_minmax(0,1fr)_auto]'
            href={this.entrance3Href}
          >
            <span
              class='hidden font-mono text-[length:clamp(3rem,7vw,6rem)] font-extrabold leading-none text-transparent transition-[-webkit-text-stroke-color] duration-150 ease-[ease] [-webkit-text-stroke:1.5px_color-mix(in_srgb,var(--color-ring)_55%,transparent)] group-hover:[-webkit-text-stroke-color:var(--color-primary)] min-[721px]:block'
              aria-hidden='true'
            >
              {'03'}
            </span>
            <div>
              <span class='block font-mono text-[length:clamp(1.5rem,2.8vw,2.4rem)] font-extrabold leading-[1.05] tracking-[-0.02em] text-foreground transition-[color] duration-150 ease-[ease] group-hover:text-primary'>
                {this.entrance3Title}
              </span>
              <p class='mt-2 mb-0 font-mono text-(length:--text-xs) leading-[1.6] text-muted-foreground'>
                {this.entrance3Copy}
              </p>
            </div>
            <span
              class='font-mono text-(length:--text-5xl) text-ring transition-[transform,color] duration-150 ease-[ease] group-hover:translate-x-2 group-hover:text-primary'
              aria-hidden='true'
            >
              {'→'}
            </span>
          </a>
          <a
            class='group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-[clamp(1rem,4vw,4rem)] border-b border-border px-[clamp(1.5rem,5vw,4.5rem)] py-[clamp(1.25rem,3.5vh,2.5rem)] text-inherit no-underline transition-[background] duration-150 ease-[ease] hover:bg-[linear-gradient(90deg,color-mix(in_srgb,var(--color-primary)_8%,transparent),transparent)] min-[721px]:grid-cols-[minmax(5rem,0.16fr)_minmax(0,1fr)_auto]'
            href={this.entrance4Href}
          >
            <span
              class='hidden font-mono text-[length:clamp(3rem,7vw,6rem)] font-extrabold leading-none text-transparent transition-[-webkit-text-stroke-color] duration-150 ease-[ease] [-webkit-text-stroke:1.5px_color-mix(in_srgb,var(--color-ring)_55%,transparent)] group-hover:[-webkit-text-stroke-color:var(--color-primary)] min-[721px]:block'
              aria-hidden='true'
            >
              {'04'}
            </span>
            <div>
              <span class='block font-mono text-[length:clamp(1.5rem,2.8vw,2.4rem)] font-extrabold leading-[1.05] tracking-[-0.02em] text-foreground transition-[color] duration-150 ease-[ease] group-hover:text-primary'>
                {this.entrance4Title}
              </span>
              <p class='mt-2 mb-0 font-mono text-(length:--text-xs) leading-[1.6] text-muted-foreground'>
                {this.entrance4Copy}
              </p>
            </div>
            <span
              class='font-mono text-(length:--text-5xl) text-ring transition-[transform,color] duration-150 ease-[ease] group-hover:translate-x-2 group-hover:text-primary'
              aria-hidden='true'
            >
              {'→'}
            </span>
          </a>
          <a
            class='group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-[clamp(1rem,4vw,4rem)] border-b border-border px-[clamp(1.5rem,5vw,4.5rem)] py-[clamp(1.25rem,3.5vh,2.5rem)] text-inherit no-underline transition-[background] duration-150 ease-[ease] hover:bg-[linear-gradient(90deg,color-mix(in_srgb,var(--color-primary)_8%,transparent),transparent)] min-[721px]:grid-cols-[minmax(5rem,0.16fr)_minmax(0,1fr)_auto]'
            href={this.entrance5Href}
          >
            <span
              class='hidden font-mono text-[length:clamp(3rem,7vw,6rem)] font-extrabold leading-none text-transparent transition-[-webkit-text-stroke-color] duration-150 ease-[ease] [-webkit-text-stroke:1.5px_color-mix(in_srgb,var(--color-ring)_55%,transparent)] group-hover:[-webkit-text-stroke-color:var(--color-primary)] min-[721px]:block'
              aria-hidden='true'
            >
              {'05'}
            </span>
            <div>
              <span class='block font-mono text-[length:clamp(1.5rem,2.8vw,2.4rem)] font-extrabold leading-[1.05] tracking-[-0.02em] text-foreground transition-[color] duration-150 ease-[ease] group-hover:text-primary'>
                {this.entrance5Title}
              </span>
              <p class='mt-2 mb-0 font-mono text-(length:--text-xs) leading-[1.6] text-muted-foreground'>
                {this.entrance5Copy}
              </p>
            </div>
            <span
              class='font-mono text-(length:--text-5xl) text-ring transition-[transform,color] duration-150 ease-[ease] group-hover:translate-x-2 group-hover:text-primary'
              aria-hidden='true'
            >
              {'→'}
            </span>
          </a>
        </nav>
      </div>
    );
  }
}
