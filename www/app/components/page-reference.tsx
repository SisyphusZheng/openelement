/**
 * Compiled API reference page (v0.44, ADR-0143/ADR-0148).
 *
 * The route projects locale and package records onto these plain properties;
 * this module contains only the compiler-owned element class and its static
 * render grammar. Package rows are a keyed list Block so server output,
 * browser creation and existing-DOM hydration share one identity model.
 */
import { element, OpenElement, property } from '@openelement/element';
import '#site-ui/open-reading-shell.tsx';
import '../site-ui/open-section-frame.tsx';
import '../islands/open-page-rail.tsx';
import pageReferenceStyles from './page-reference.css';

export interface ApiPackageItem {
  id: string;
  name: string;
  importPath: string;
  copy: string;
  note1: string;
  note2: string;
  note3: string;
  export1: string;
  export2: string;
  export3: string;
  export4: string;
  export5: string;
  kind: string;
  kindClass: string;
  kindLabel: string;
}

/** One generated export entry; `anchor` is the generated searchRecord anchor. */
export interface ApiReferenceItem {
  key: string;
  anchor: string;
  name: string;
  container: string;
  kind: string;
  stability: string;
  summary: string;
  /** Declared call shape rendered from the source declaration. */
  signature: string;
  /**
   * The export's option-bag members as one display line (`name: type —
   * description`, `; `-joined): a list Block item template admits
   * `{item.<field>}` values and nested elements, not a nested Block, so the
   * per-export table renders as text while the config section below renders as
   * a real table (it is a top-level Block).
   */
  options: string;
  source: string;
}

/** One row of the generated config-option table (an each Block item). */
export interface ApiOptionRow {
  key: string;
  name: string;
  type: string;
  required: string;
  defaultValue: string;
  description: string;
}

/** One generated custom-element record with its detail lists inlined. */
export interface ApiElementItem {
  key: string;
  anchor: string;
  tag: string;
  className: string;
  description: string;
  layer: string;
  hydrate: string;
  module: string;
  /** Locale label shown only for manifest status 'experimental'; else empty. */
  status: string;
  attributes: string;
  events: string;
  slots: string;
  cssParts: string;
  attributesLabel: string;
  eventsLabel: string;
  slotsLabel: string;
  partsLabel: string;
}

interface ApiRailItem {
  id: string;
  href: string;
  label: string;
  depth: string;
}

interface ApiMetadata {
  breadcrumb: string;
  title: string;
  lede: string;
}

// The route->program tag binding reads this module's own @element tag
// (route-scanner semantics.exportedTagName); the path-derived tag is only
// the fallback for classes without one.
@element('reference-page')
export default class ReferencePage extends OpenElement {
  static override styles = [pageReferenceStyles];

  @property({ reflect: false, attribute: false })
  metadata: ApiMetadata = { breadcrumb: '', title: '', lede: '' };

  @property({ reflect: false, attribute: false })
  railItems: ApiRailItem[] = [];

  @property({ reflect: false, attribute: false })
  s1Index = '';

  @property({ reflect: false, attribute: false })
  s1Title = '';

  @property({ reflect: false, attribute: false })
  s1Copy = '';

  @property({ reflect: false, attribute: false })
  s2Index = '';

  @property({ reflect: false, attribute: false })
  s2Title = '';

  @property({ reflect: false, attribute: false })
  s2Copy = '';

  @property({ reflect: false, attribute: false })
  headPackage = '';

  @property({ reflect: false, attribute: false })
  headSubpaths = '';

  @property({ reflect: false, attribute: false })
  headKind = '';

  @property({ reflect: false, attribute: false })
  footnote = '';

  @property({ reflect: false, attribute: false })
  footnoteCheckPre = '';

  @property({ reflect: false, attribute: false })
  footnoteCheckPost = '';

  @property({ reflect: false, attribute: false })
  packages: ApiPackageItem[] = [];

  @property({ reflect: false, attribute: false })
  s3Index = '';

  @property({ reflect: false, attribute: false })
  s3Title = '';

  @property({ reflect: false, attribute: false })
  s3Copy = '';

  @property({ reflect: false, attribute: false })
  headExport = '';

  @property({ reflect: false, attribute: false })
  headSummary = '';

  @property({ reflect: false, attribute: false })
  headSource = '';

  @property({ reflect: false, attribute: false })
  referenceEntries: ApiReferenceItem[] = [];

  @property({ reflect: false, attribute: false })
  s5Index = '';

  @property({ reflect: false, attribute: false })
  s5Title = '';

  @property({ reflect: false, attribute: false })
  s5Copy = '';

  @property({ reflect: false, attribute: false })
  headOption = '';

  @property({ reflect: false, attribute: false })
  headOptionType = '';

  @property({ reflect: false, attribute: false })
  headOptionRequired = '';

  @property({ reflect: false, attribute: false })
  configOptions: ApiOptionRow[] = [];

  @property({ reflect: false, attribute: false })
  s4Index = '';

  @property({ reflect: false, attribute: false })
  s4Title = '';

  @property({ reflect: false, attribute: false })
  s4Copy = '';

  @property({ reflect: false, attribute: false })
  elementEntries: ApiElementItem[] = [];

  // Same base-field redeclaration as open-layout: the compiled @property
  // shadows OpenElementConfiguration.locale (SSR injection or the `locale`
  // attribute); tsc's `override` demand is rejected by the compiled grammar.
  @property({ reflect: false })
  // @ts-expect-error compiled @property shadows the optional base field
  locale = 'en';

  render() {
    return (
      // Without data-pagefind-body the page is absent from the index entirely:
      // pagefind stops indexing every page that lacks the attribute. The shell
      // already renders the one <main> landmark (#main-content).
      <div class='text-foreground' data-pagefind-body>
        <open-reading-shell rail footer metadata={this.metadata} locale={this.locale}>
          <div slot='rail'>
            <open-page-rail items={this.railItems} locale={this.locale}></open-page-rail>
          </div>
          <open-section-frame>
            <span slot='index'>{this.s1Index}</span>
            <span slot='title'>{this.s1Title}</span>
            <span slot='copy'>{this.s1Copy}</span>
          </open-section-frame>
          <open-section-frame>
            <span slot='index'>{this.s2Index}</span>
            <span slot='title'>{this.s2Title}</span>
            <span slot='copy'>{this.s2Copy}</span>
            <div class='border-t border-border'>
              <div
                class='hidden grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)_auto] items-start gap-[clamp(1rem,4vw,3rem)] border-b border-border py-3 text-(length:--font-size-micro) font-bold tracking-[0.18em] text-muted-foreground uppercase min-[861px]:grid'
                aria-hidden='true'
              >
                <span>{this.headPackage}</span>
                <span>{this.headSubpaths}</span>
                <span>{this.headKind}</span>
              </div>
              {this.packages.map((pkg) => (
                <div
                  class='group grid grid-cols-[minmax(0,1fr)] items-start gap-3 border-b border-border py-6 min-[861px]:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)_auto] min-[861px]:gap-[clamp(1rem,4vw,3rem)]'
                  id={pkg.id}
                  data-kind={pkg.kind}
                  key={pkg.id}
                >
                  <div>
                    <span class='block text-primary text-[length:clamp(1.7rem,2.8vw,2.5rem)] font-extrabold leading-none tracking-[-0.03em] group-data-[kind=optional]:text-muted-foreground'>
                      {pkg.name}
                    </span>
                    <span class='mt-2 block text-(length:--text-xs) text-muted-foreground'>
                      {pkg.importPath}
                    </span>
                    <p class='mt-3 mb-0 text-(length:--text-sm) leading-normal text-muted-foreground'>
                      {pkg.copy}
                    </p>
                    <span class='mt-2 block text-(length:--text-xs) leading-normal text-muted-foreground empty:hidden'>
                      {pkg.note1}
                    </span>
                    <span class='mt-2 block text-(length:--text-xs) leading-normal text-muted-foreground empty:hidden'>
                      {pkg.note2}
                    </span>
                    <span class='mt-2 block text-(length:--text-xs) leading-normal text-muted-foreground empty:hidden'>
                      {pkg.note3}
                    </span>
                  </div>
                  <div class='flex flex-wrap gap-2'>
                    <span class='rounded-md bg-border px-2 py-1 text-(length:--text-xs) text-primary empty:hidden'>
                      {pkg.export1}
                    </span>
                    <span class='rounded-md bg-border px-2 py-1 text-(length:--text-xs) text-primary empty:hidden'>
                      {pkg.export2}
                    </span>
                    <span class='rounded-md bg-border px-2 py-1 text-(length:--text-xs) text-primary empty:hidden'>
                      {pkg.export3}
                    </span>
                    <span class='rounded-md bg-border px-2 py-1 text-(length:--text-xs) text-primary empty:hidden'>
                      {pkg.export4}
                    </span>
                    <span class='rounded-md bg-border px-2 py-1 text-(length:--text-xs) text-primary empty:hidden'>
                      {pkg.export5}
                    </span>
                  </div>
                  <span class={pkg.kindClass}>{pkg.kindLabel}</span>
                </div>
              ))}
              <footer class='pt-6 text-(length:--text-xs) leading-normal text-muted-foreground'>
                <p class='m-0'>{this.footnote}</p>
                <p class='mt-3 mb-0'>
                  {this.footnoteCheckPre}
                  <code class='text-primary'>pnpm --dir tools/repo run interface:snapshot</code>
                  {this.footnoteCheckPost}
                </p>
              </footer>
            </div>
          </open-section-frame>
          <open-section-frame>
            <span slot='index'>{this.s3Index}</span>
            <span slot='title'>{this.s3Title}</span>
            <span slot='copy'>{this.s3Copy}</span>
            <div class='border-t border-border' id='api-reference'>
              <div
                class='hidden grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)_auto] items-start gap-[clamp(1rem,4vw,3rem)] border-b border-border py-3 text-(length:--font-size-micro) font-bold tracking-[0.18em] text-muted-foreground uppercase min-[1101px]:grid'
                aria-hidden='true'
              >
                <span>{this.headExport}</span>
                <span>{this.headSummary}</span>
                <span>{this.headSource}</span>
              </div>
              {this.referenceEntries.map((entry) => (
                <div
                  class='grid grid-cols-[minmax(0,1fr)] items-start gap-2 border-b border-border py-4 min-[1101px]:grid-cols-[minmax(0,1fr)_minmax(0,1.45fr)_minmax(0,1.2fr)] min-[1101px]:gap-[clamp(1rem,4vw,3rem)]'
                  id={entry.anchor}
                  key={entry.key}
                >
                  <div>
                    <span class='inline text-primary font-mono text-(length:--text-base) font-bold wrap-anywhere'>
                      {entry.name}
                    </span>
                    <span class='mt-1 block text-(length:--text-xs) text-muted-foreground wrap-anywhere'>
                      {entry.container}
                    </span>
                    <span class='me-1 rounded-md bg-border px-2 py-1 text-(length:--text-xs) text-primary empty:hidden'>
                      {entry.kind}
                    </span>
                    <span class='me-1 rounded-md bg-transparent px-2 py-1 text-(length:--text-xs) text-primary empty:hidden shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-ring)_55%,transparent)]'>
                      {entry.stability}
                    </span>
                  </div>
                  <div>
                    <p class='m-0 text-(length:--text-sm) leading-normal text-muted-foreground wrap-anywhere'>
                      {entry.summary}
                    </p>
                    <code class='mt-2 block font-mono text-(length:--text-xs) leading-snug text-primary wrap-anywhere'>
                      {entry.signature}
                    </code>
                    <p class='mt-3 mb-0 wrap-anywhere'>{entry.options}</p>
                  </div>
                  <span class='font-mono text-(length:--text-xs) text-muted-foreground wrap-anywhere'>
                    {entry.source}
                  </span>
                </div>
              ))}
            </div>
          </open-section-frame>
          <open-section-frame>
            <span slot='index'>{this.s5Index}</span>
            <span slot='title'>{this.s5Title}</span>
            <span slot='copy'>{this.s5Copy}</span>
            <div class='border-t border-border' id='config-options'>
              <div
                class='hidden grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)_auto] items-start gap-[clamp(1rem,4vw,3rem)] border-b border-border py-3 text-(length:--font-size-micro) font-bold tracking-[0.18em] text-muted-foreground uppercase min-[1101px]:grid'
                aria-hidden='true'
              >
                <span>{this.headOption}</span>
                <span>{this.headOptionType}</span>
                <span>{this.headOptionRequired}</span>
              </div>
              {this.configOptions.map((option) => (
                <div
                  class='grid grid-cols-[minmax(0,1fr)] items-start gap-2 border-b border-border py-4 min-[1101px]:grid-cols-[minmax(0,1fr)_minmax(0,1.45fr)_minmax(0,1.2fr)] min-[1101px]:gap-[clamp(1rem,4vw,3rem)]'
                  id={option.key}
                  key={option.key}
                >
                  <div>
                    <span class='inline text-primary font-mono text-(length:--text-base) font-bold wrap-anywhere'>
                      {option.name}
                    </span>
                    <span class='mt-1 block text-(length:--text-xs) text-muted-foreground wrap-anywhere'>
                      {option.defaultValue}
                    </span>
                  </div>
                  <div>
                    <code class='mt-2 block font-mono text-(length:--text-xs) leading-snug text-primary wrap-anywhere'>
                      {option.type}
                    </code>
                    <p class='m-0 text-(length:--text-sm) leading-normal text-muted-foreground wrap-anywhere'>
                      {option.description}
                    </p>
                  </div>
                  <span class='font-mono text-(length:--text-xs) text-muted-foreground wrap-anywhere'>
                    {option.required}
                  </span>
                </div>
              ))}
            </div>
          </open-section-frame>
          <open-section-frame>
            <span slot='index'>{this.s4Index}</span>
            <span slot='title'>{this.s4Title}</span>
            <span slot='copy'>{this.s4Copy}</span>
            <div class='border-t border-border' id='element-reference'>
              {this.elementEntries.map((element) => (
                // Compiled list-Block grammar (OEC9013): item children are
                // static text, {element.<field>} values or intrinsic elements —
                // no conditional JSX. Stable rows carry status:'' and the
                // `empty:hidden` utility on the status chip hides it.
                <div
                  class='grid grid-cols-[minmax(0,1fr)] items-start gap-2 border-b border-border py-4 min-[1101px]:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)] min-[1101px]:gap-[clamp(1rem,4vw,3rem)]'
                  id={element.anchor}
                  key={element.key}
                >
                  <div>
                    <span class='inline text-primary font-mono text-(length:--text-base) font-bold wrap-anywhere'>
                      {element.tag}
                    </span>
                    <span class='mt-1 block text-(length:--text-xs) text-muted-foreground wrap-anywhere'>
                      {element.className}
                    </span>
                    <span class='me-1 rounded-md bg-border px-2 py-1 text-(length:--text-xs) text-primary empty:hidden'>
                      {element.layer}
                    </span>
                    <span class='me-1 rounded-md bg-border px-2 py-1 text-(length:--text-xs) text-primary empty:hidden'>
                      {element.hydrate}
                    </span>
                    <span class='me-1 rounded-md bg-transparent px-2 py-1 text-(length:--text-xs) text-primary empty:hidden shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-ring)_55%,transparent)]'>
                      {element.status}
                    </span>
                  </div>
                  <p class='m-0 text-(length:--text-sm) leading-normal text-muted-foreground'>
                    {element.description}
                  </p>
                  <span class='font-mono text-(length:--text-xs) text-muted-foreground wrap-anywhere'>
                    {element.module}
                  </span>
                  <div class='col-span-full grid gap-2'>
                    <span class='block text-(length:--text-xs) leading-normal text-muted-foreground wrap-anywhere'>
                      <b class='me-2 font-bold tracking-[0.08em] text-muted-foreground uppercase'>
                        {element.attributesLabel}
                      </b>
                      {element.attributes}
                    </span>
                    <span class='block text-(length:--text-xs) leading-normal text-muted-foreground wrap-anywhere'>
                      <b class='me-2 font-bold tracking-[0.08em] text-muted-foreground uppercase'>
                        {element.eventsLabel}
                      </b>
                      {element.events}
                    </span>
                    <span class='block text-(length:--text-xs) leading-normal text-muted-foreground wrap-anywhere'>
                      <b class='me-2 font-bold tracking-[0.08em] text-muted-foreground uppercase'>
                        {element.slotsLabel}
                      </b>
                      {element.slots}
                    </span>
                    <span class='block text-(length:--text-xs) leading-normal text-muted-foreground wrap-anywhere'>
                      <b class='me-2 font-bold tracking-[0.08em] text-muted-foreground uppercase'>
                        {element.partsLabel}
                      </b>
                      {element.cssParts}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </open-section-frame>
        </open-reading-shell>
      </div>
    );
  }
}
