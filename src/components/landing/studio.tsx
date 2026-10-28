import Image from "next/image";

export function LandingStudio() {
  return (
    <section className="min-w-0">
      <p className="font-mono text-xs uppercase tracking-widest text-electric">Studio</p>
      <h2 className="mt-4 text-balance text-3xl font-medium tracking-tight">Set your project in motion.</h2>
      <p className="mt-5 min-h-18 text-base leading-relaxed text-muted-foreground">Studio is where your project comes together. Connect sources, set triggers, and see how models turn observations into data products.</p>
      <div className="mt-8 overflow-hidden rounded-xl border bg-card">
        <Image src="/studio-preview.png" alt="ARGUS Studio showing a bridge video, data products, sources, and model activity" width={1907} height={1030} sizes="(min-width: 1152px) 560px, (min-width: 1024px) 50vw, 100vw" className="aspect-video h-auto w-full object-cover object-top" />
      </div>
    </section>
  );
}
