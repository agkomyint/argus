import { LandingProjects } from "./projects";
import { LandingStudio } from "./studio";

export function LandingProjectTabs() {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 sm:pb-24">
      <div className="grid gap-12 border-t pt-12 sm:pt-16 lg:grid-cols-2 lg:gap-8">
        <LandingProjects />
        <LandingStudio />
      </div>
    </section>
  );
}

