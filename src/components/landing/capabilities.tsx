export function LandingCapabilities() {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
      <div className="border-t pt-12 sm:pt-16">
        <p className="font-mono text-xs uppercase tracking-widest text-electric">What ARGUS makes possible</p>
        <div className="mt-4 grid gap-6 lg:grid-cols-2 lg:gap-16">
          <h2 className="max-w-xl text-balance text-3xl font-medium tracking-tight sm:text-4xl">There is more in your data than you can see at a glance.</h2>
          <p className="max-w-xl text-base leading-relaxed text-muted-foreground">Videos, records, and other sources can hold useful patterns, but finding them takes time. ARGUS helps turn observations into data products you can explore, bringing the evidence and the result together.</p>
        </div>
        <div className="mt-12 grid gap-8 border-t pt-8 md:grid-cols-3">
          <div><p className="font-mono text-xs text-electric">01 / UNDERSTAND</p><h3 className="mt-3 text-lg font-medium">See patterns</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Turn observations into counts, trends, maps, and event feeds that make changes easier to see.</p></div>
          <div><p className="font-mono text-xs text-electric">02 / EXPLORE</p><h3 className="mt-3 text-lg font-medium">Ask your own questions</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Bring related data products into a project and use Ask AI to explore what they show.</p></div>
          <div><p className="font-mono text-xs text-electric">03 / KEEP WATCH</p><h3 className="mt-3 text-lg font-medium">Know when things change</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Set rules on data products and see personal alerts when those rules are met.</p></div>
        </div>
        <div className="mt-12 border-l-2 border-electric pl-5">
          <p className="font-mono text-xs uppercase tracking-widest text-electric">Made for your questions</p>
          <p className="mt-3 max-w-3xl text-base leading-relaxed text-muted-foreground">Track a personal habit, understand activity in a space, or investigate a question for your work. <strong className="font-medium text-foreground">Start with what you want to understand</strong> and bring the relevant data products together in a project.</p>
        </div>
      </div>
    </section>
  );
}
