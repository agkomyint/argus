import Image from "next/image";

export function LandingProjects() {
  return (
    <section className="min-w-0">
      <p className="font-mono text-xs uppercase tracking-widest text-electric">Projects</p>
      <h2 className="mt-4 text-balance text-3xl font-medium tracking-tight">One place for your questions.</h2>
      <p className="mt-5 min-h-18 text-base leading-relaxed text-muted-foreground">A project brings the data products for your use case together, so you can explore them in one place.</p>
      <div className="mt-8 overflow-hidden rounded-xl border bg-card">
        <Image src="/projects-preview.png" alt="Example Projects screen showing a personal water tracking project" width={1907} height={1021} sizes="(min-width: 1152px) 560px, (min-width: 1024px) 50vw, 100vw" className="aspect-video h-auto w-full object-cover object-top" />
      </div>
    </section>
  );
}
