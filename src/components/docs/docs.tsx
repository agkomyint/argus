import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { FAQ, GUIDES, type FaqSection, type Guide, type Shot } from "./content";

const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/** A screenshot sized from its own width, so a tall phone-shaped one does not fill the page. */
function Screenshot({ shot, eager = false, className }: { shot: Shot; eager?: boolean; className?: string }) {
  const narrow = shot.height > shot.width ? "max-w-[18rem]" : shot.width <= 600 ? "max-w-md" : shot.width <= 900 ? "max-w-xl" : "";
  return (
    <figure className={cn("w-full", narrow, className)}>
      <Image
        src={shot.src}
        width={shot.width}
        height={shot.height}
        alt={shot.alt}
        sizes={shot.width > 900 ? "(min-width: 1024px) 720px, 100vw" : `${Math.min(shot.width, 576)}px`}
        loading={eager ? "eager" : "lazy"}
        className="h-auto w-full border bg-muted"
      />
      {shot.caption && <figcaption className="mt-2 font-mono text-[11px] text-muted-foreground">{shot.caption}</figcaption>}
    </figure>
  );
}

/** One how-to: numbered steps, the real screen they happen on, and the notes that save a wrong turn. */
export function DocsGuide({ guide, n, eager }: { guide: Guide; n: number; eager?: boolean }) {
  return (
    <section id={guide.id} aria-labelledby={`${guide.id}-title`} className="scroll-mt-24 border-t py-10">
      <p className="font-mono text-xs text-electric">{String(n).padStart(2, "0")}</p>
      <h2 id={`${guide.id}-title`} className="mt-2 text-2xl font-medium tracking-tight">{guide.title}</h2>
      <p className="mt-2 max-w-2xl text-pretty text-muted-foreground">{guide.lead}</p>
      <ol className="mt-6 max-w-2xl space-y-3">
        {guide.steps.map((s, i) => (
          <li key={i} className="flex gap-3 text-[15px] leading-relaxed">
            <span aria-hidden className="mt-0.5 flex size-6 shrink-0 items-center justify-center border font-mono text-[11px] text-muted-foreground">{i + 1}</span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
      {guide.shot && <Screenshot shot={guide.shot} eager={eager} className="mt-8" />}
      {guide.tips && (
        <ul className="mt-6 max-w-2xl space-y-2 border-l-2 border-electric/60 pl-4 text-sm text-muted-foreground">
          {guide.tips.map((t) => <li key={t}>{t}</li>)}
        </ul>
      )}
    </section>
  );
}

/** Questions as native disclosure rows: no script, and every answer is in the page for search and find-in-page. */
export function DocsFaq({ sections = FAQ, open = false }: { sections?: FaqSection[]; open?: boolean }) {
  return (
    <div className="space-y-10">
      {sections.map((s) => (
        <section key={s.id} id={s.id} aria-labelledby={`${s.id}-title`} className="scroll-mt-24">
          <h3 id={`${s.id}-title`} className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{s.title}</h3>
          <div className="mt-3 divide-y border-y">
            {s.items.map((q) => (
              <details key={q.question} open={open} className="group">
                <summary className={cn("flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-[15px] font-medium [&::-webkit-details-marker]:hidden", focus)}>
                  {q.question}
                  <span aria-hidden className="font-mono text-muted-foreground transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="max-w-2xl pb-5 text-[15px] leading-relaxed text-muted-foreground">{q.answer}</p>
              </details>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** The whole documentation: guides in the order a new person meets them, then the FAQ, with a contents rail. */
export function Docs({ guides = GUIDES, faq = FAQ }: { guides?: Guide[]; faq?: FaqSection[] }) {
  return (
    <div className="grid gap-10 lg:grid-cols-[13rem_minmax(0,1fr)]">
      <nav aria-label="Documentation" className="lg:sticky lg:top-24 lg:max-h-[calc(100dvh-8rem)] lg:self-start lg:overflow-y-auto">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Guides</p>
        <ol className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm lg:flex-col">
          {guides.map((g) => <li key={g.id}><a href={`#${g.id}`} className={cn("text-muted-foreground hover:text-foreground", focus)}>{g.title}</a></li>)}
        </ol>
        <p className="mt-6 font-mono text-xs uppercase tracking-widest text-muted-foreground">FAQ</p>
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm lg:flex-col">
          {faq.map((s) => <li key={s.id}><a href={`#${s.id}`} className={cn("text-muted-foreground hover:text-foreground", focus)}>{s.title}</a></li>)}
        </ul>
      </nav>
      <div className="min-w-0 max-w-3xl">
        {guides.map((g, i) => <DocsGuide key={g.id} guide={g} n={i + 1} eager={i === 0} />)}
        <section id="faq" aria-labelledby="faq-title" className="scroll-mt-24 border-t py-10">
          <h2 id="faq-title" className="text-2xl font-medium tracking-tight">Questions</h2>
          <div className="mt-8"><DocsFaq sections={faq} /></div>
        </section>
      </div>
    </div>
  );
}

/** The home page's documentation section: the first guides as picture cards, the basic questions, and the way to the rest. */
export function LandingDocs({ guides = GUIDES.slice(0, 6), faq = FAQ.slice(0, 2) }: { guides?: Guide[]; faq?: FaqSection[] }) {
  return (
    <section aria-labelledby="landing-docs-title" className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 sm:pb-24">
      <div className="border-t pt-12 sm:pt-16">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-electric">Documentation</p>
            <h2 id="landing-docs-title" className="mt-3 text-balance text-3xl font-medium tracking-tight sm:text-4xl">From first replay to your own project</h2>
          </div>
          <Link href="/docs" className={cn("inline-flex min-h-10 items-center rounded-md border px-4 text-sm font-medium transition-colors hover:bg-accent", focus)}>All guides <span aria-hidden className="ml-2">→</span></Link>
        </div>
        <ol className="mt-10 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {guides.map((g, i) => (
            <li key={g.id}>
              <Link href={`/docs#${g.id}`} className={cn("group block", focus)}>
                {g.shot && (
                  <div className="aspect-[16/10] overflow-hidden border bg-muted">
                    <Image src={g.shot.src} width={g.shot.width} height={g.shot.height} alt="" sizes="(min-width: 1024px) 360px, (min-width: 640px) 50vw, 100vw" className="size-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.02]" />
                  </div>
                )}
                <p className="mt-4 font-mono text-[11px] text-muted-foreground">{String(i + 1).padStart(2, "0")}</p>
                <h3 className="mt-1 text-lg font-medium group-hover:text-electric">{g.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{g.lead}</p>
              </Link>
            </li>
          ))}
        </ol>
        <div className="mt-16 grid gap-10 lg:grid-cols-[13rem_minmax(0,1fr)]">
          <div>
            <h2 className="text-2xl font-medium tracking-tight">Questions</h2>
            <Link href="/docs#faq" className={cn("mt-3 inline-block text-sm text-electric underline-offset-4 hover:underline", focus)}>Every question</Link>
          </div>
          <div className="max-w-3xl"><DocsFaq sections={faq} /></div>
        </div>
      </div>
    </section>
  );
}
