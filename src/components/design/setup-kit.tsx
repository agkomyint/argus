"use client";

import { useState } from "react";
import { LANE_STEPS, PRODUCT_STEPS, StepBar } from "@/components/workspace/new-project-dialog";
import { GoalStep, LanePlan, ProductPicks, Thinking, type ProductItem } from "@/components/workspace/setup-steps";
import { planProblems, type SetupLane } from "@/lib/setup-rules";

/** Every state of AI setup for /design (PRJ-03), each one live so the edits and the code check can be tried. */

const BODY_PICKS = [
  { id: "body-progress", why: "Plots each area you train week by week, so you see whether your abs are coming in." },
  { id: "body-compare", why: "Puts day 1 next to today, the picture people actually want." },
  { id: "checkin-streak", why: "Keeps you honest about taking the photo every day." },
];

const BODY_LANES: SetupLane[] = [
  { name: "Front photo", note: "One front photo a day, same spot and light, shirt off.", analyzer: "body", feeds: ["body-progress", "body-compare", "checkin-streak"] },
  { name: "Side photo", note: "Side view, arms relaxed, same distance as the front photo.", analyzer: "body", feeds: ["body-progress"] },
];

function Frame({ title, step, children }: { title: string; step: 1 | 2 | 3; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{title}</p>
      <div className="max-h-[34rem] overflow-y-auto border">
        <StepBar step={step} reach={step} />
        {children}
      </div>
    </div>
  );
}

export function SetupStates({ items }: { items: ProductItem[] }) {
  const [goal, setGoal] = useState("");
  const [picked, setPicked] = useState(BODY_PICKS.slice(0, 2).map((p) => p.id));
  const [name, setName] = useState("My body log");
  const [lanes, setLanes] = useState(BODY_LANES);
  const picks = BODY_PICKS.map((p) => p.id);
  const [broken, setBroken] = useState<SetupLane[]>([{ ...BODY_LANES[0], analyzer: "objects", feeds: [] }]);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Frame title="1 · Goal, empty (try an example)" step={1}><GoalStep goal={goal} onGoal={setGoal} /></Frame>
      <Frame title="1 · Goal, the model did not answer" step={1}><GoalStep goal="My abs" onGoal={() => {}} error="The model did not answer. Try again, or pick products yourself." /></Frame>
      <Frame title="1 → 2 · Suggesting products" step={1}><Thinking steps={PRODUCT_STEPS} current={0} /></Frame>
      <Frame title="2 → 3 · Planning lanes, second step running" step={2}><Thinking steps={LANE_STEPS} current={1} /></Frame>
      <Frame title="2 · Products, with what ARGUS suggests" step={2}><ProductPicks items={items} picks={BODY_PICKS} picked={picked} onToggle={toggle} name={name} onName={setName} /></Frame>
      <Frame title="2 · Products, nothing matched" step={2}><ProductPicks items={items} picks={[]} picked={[]} onToggle={() => {}} name="" onName={() => {}} /></Frame>
      <Frame title="3 · Lanes the AI planned (edit them)" step={3}><LanePlan lanes={lanes} onChange={setLanes} items={items} picked={picks} problems={planProblems({ lanes }, picks)} attempts={1} /></Frame>
      <Frame title="3 · Lanes, failing the code check" step={3}><LanePlan lanes={broken} onChange={setBroken} items={items} picked={picks} problems={planProblems({ lanes: broken }, picks)} attempts={2} /></Frame>
    </div>
  );
}
