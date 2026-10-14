import {
  computed,
  element,
  OpenElement,
  property,
  type TrustedHtml,
  trustedHtml,
} from '@openelement/element';
import '#site-ui/open-reading-shell.tsx';
import '../islands/open-page-rail.tsx';
import pageBlogPostStyles from './page-blog-post.css';
import '#site-ui/open-artifact-panel.tsx';

interface BlogTag {
  key: string;
  label: string;
}
interface BlogRailItem {
  id: string;
  href: string;
  label: string;
  depth: string;
}
interface BlogNavigationItem {
  href: string;
  label: string;
}
interface BlogNavigation {
  previous?: BlogNavigationItem;
  next?: BlogNavigationItem;
}

@element('blog-slug')
export default class PageBlogPost extends OpenElement {
  static override styles = [pageBlogPostStyles];

  @property({ reflect: false, attribute: false })
  notFoundClass = 'not-found';
  @property({ reflect: false, attribute: false })
  articleClass = 'is-hidden';
  // Visibility is the native `hidden` attribute now: the retired sheet's
  // `.is-hidden` rule is gone, and the blog route (www/app/routes/blog) still
  // passes the state as class-string props, so the component reads the token
  // it encoded and re-delivers it as `hidden`.
  @property({ reflect: false, attribute: false })
  notFoundHidden = computed(() => this.notFoundClass.includes('is-hidden'));
  @property({ reflect: false, attribute: false })
  articleHidden = computed(() => this.articleClass.includes('is-hidden'));
  @property({ reflect: false, attribute: false })
  notFoundMessage = '';
  @property({ reflect: false, attribute: false })
  slug = '';
  @property({ reflect: false, attribute: false })
  blogHref = '';
  @property({ reflect: false, attribute: false })
  backLabel = '';
  @property({ reflect: false, attribute: false })
  breadcrumbLabel = '';
  @property({ reflect: false, attribute: false })
  crumbCurrent = '';
  @property({ reflect: false, attribute: false })
  postTitle = '';
  @property({ reflect: false, attribute: false })
  lede = '';
  @property({ reflect: false, attribute: false })
  date = '';
  @property({ reflect: false, attribute: false })
  postLang = '';
  @property({ reflect: false, attribute: false })
  langNotice = '';
  @property({ reflect: false, attribute: false })
  tags: BlogTag[] = [];
  @property({ reflect: false, attribute: false })
  railItems: BlogRailItem[] = [];
  @property({ reflect: false, attribute: false })
  navigation: BlogNavigation = {};
  @property({ type: Object, reflect: false, attribute: false })
  articleHtml: TrustedHtml = trustedHtml('');
  @property({ reflect: false, attribute: false })
  nextDispatchLabel = '';
  @property({ reflect: false, attribute: false })
  nextDispatchHref = '';
  @property({ reflect: false, attribute: false })
  nextDispatchText = '';

  // Same base-field redeclaration as open-layout: the compiled @property
  // shadows OpenElementConfiguration.locale (SSR injection or the `locale`
  // attribute); tsc's `override` demand is rejected by the compiled grammar.
  @property({ reflect: false })
  // @ts-expect-error compiled @property shadows the optional base field
  locale = 'en';

  render() {
    return (
      <div>
        <div
          class='px-4 py-12 text-center text-muted-foreground'
          hidden={this.notFoundHidden}
          data-pagefind-ignore
        >
          <h1 class='mb-4 font-black leading-[1.05] tracking-[-0.06em] text-foreground text-(length:--text-5xl) min-[481px]:text-(length:--text-6xl) min-[901px]:text-[clamp(2.7rem,6vw,5.5rem)]'>
            404
          </h1>
          <p class='my-2 text-sm leading-[1.72] text-foreground min-[901px]:text-(length:--text-base)'>
            {this.notFoundMessage}: {this.slug}
          </p>
          <a
            class='text-primary underline underline-offset-[3px] decoration-[color-mix(in_srgb,var(--color-primary)_34%,transparent)] decoration-1 transition-[color,text-decoration-color] duration-150 ease-in-out hover:text-[color-mix(in_srgb,var(--color-primary)_80%,var(--color-foreground))] hover:decoration-current focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-[3px] motion-reduce:transition-none'
            href={this.blogHref}
          >
            ← {this.backLabel}
          </a>
        </div>

        <div hidden={this.articleHidden} data-pagefind-body>
          <open-reading-shell meta rail footer navigation={this.navigation} locale={this.locale}>
            <div slot='meta'>
              <p class='mb-4 flex flex-wrap items-baseline gap-2 font-mono text-(length:--text-xs) leading-[1.72] font-extrabold tracking-[0.1em] text-muted-foreground uppercase'>
                <a
                  class='text-muted-foreground no-underline transition-[color,text-decoration-color] duration-150 ease-in-out hover:text-primary focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-[3px] motion-reduce:transition-none'
                  href={this.blogHref}
                >
                  {this.breadcrumbLabel}
                </a>
                <span>/</span>
                <span class='text-primary'>{this.crumbCurrent}</span>
              </p>
              <h1
                class='m-0 font-serif text-[clamp(2.4rem,5.5vw,4.4rem)] leading-[1.02] font-normal italic tracking-[-0.01em] wrap-break-word text-balance text-foreground'
                data-pagefind-meta='title'
              >
                {this.postTitle}
              </h1>
              <p class='mt-4 max-w-[640px] text-[clamp(var(--text-base),1.4vw,var(--text-xl))] leading-[1.65] text-muted-foreground empty:hidden'>
                {this.lede}
              </p>
              <p class='mt-4 flex flex-wrap gap-2 font-mono text-(length:--text-xs) leading-[1.72] tracking-[0.06em] text-muted-foreground uppercase'>
                <time>{this.date}</time>
                {this.tags.map((tag) => (
                  <span key={tag.key}>· {tag.label}</span>
                ))}
              </p>
              <p
                class='mt-4 max-w-[640px] border-s-2 border-s-ring px-3 py-2 text-(length:--text-sm) leading-[1.65] text-muted-foreground empty:hidden'
                role='note'
              >
                {this.langNotice}
              </p>
            </div>
            <div slot='rail'>
              <open-page-rail items={this.railItems} locale={this.locale}></open-page-rail>
            </div>
            <div
              class='blog-content'
              lang={this.postLang}
              innerHTML={this.articleHtml}
              trustedHtml
            />
            <nav
              class='mt-10 grid gap-3 border-t border-border pt-6'
              aria-label={this.nextDispatchLabel}
            >
              <span class='font-mono text-(length:--text-xs) font-extrabold tracking-[0.16em] text-muted-foreground uppercase'>
                {this.nextDispatchLabel}
              </span>
              <a
                class='font-serif text-[clamp(1.7rem,3.2vw,2.6rem)] leading-[1.05] text-foreground no-underline transition-[color,text-decoration-color] duration-150 ease-in-out hover:text-primary focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-[3px] motion-reduce:transition-none'
                href={this.nextDispatchHref}
              >
                {this.nextDispatchText}
              </a>
            </nav>
          </open-reading-shell>
        </div>
      </div>
    );
  }
}
