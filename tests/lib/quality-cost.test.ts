import { describe, expect, test } from "bun:test";
import { budgetState, frames, laneAccuracy, laneCost, laneQuality, modelOf, PRESETS } from "@/lib/quality-cost";

describe("quality and cost", () => {
  test("a lane only turns on the models its analyzer uses", () => {
    const q = laneQuality("speech", PRESETS[1]);
    expect(q.models.transcribe.on).toBe(true);
    expect(q.models.reason.on).toBe(false);
    expect(q.models.segment.on).toBe(false);
    expect(laneQuality("objects", PRESETS[1]).models.segment.on).toBe(true);
    expect(modelOf("segment").family).toBe("SAM");
  });

  test("frames follow the interval and never pass the cap", () => {
    const q = laneQuality("objects", PRESETS[1]);
    expect(frames(q, { minutes: 1 })).toBe(6);
    expect(frames(q, { minutes: 600 })).toBe(q.maxFrames);
    expect(frames(q, { minutes: 0 })).toBe(1);
  });

  test("more quality costs more, off models cost nothing", () => {
    const work = { minutes: 40 };
    const lean = laneCost(laneQuality("objects", PRESETS[0]), work).total;
    const max = laneCost(laneQuality("objects", PRESETS[3]), work).total;
    expect(max).toBeGreaterThan(lean);
    const q = laneQuality("objects", PRESETS[1]);
    q.models.segment.on = false;
    expect(laneCost(q, work).per.segment).toBe(0);
    const voice = laneCost(laneQuality("speech", PRESETS[1]), { minutes: 10 });
    expect(voice.per.transcribe).toBeCloseTo(0.03);
  });

  test("accuracy rises with quality and is zero with every model off", () => {
    expect(laneAccuracy(laneQuality("objects", PRESETS[3]))).toBeGreaterThan(laneAccuracy(laneQuality("objects", PRESETS[0])));
    const q = laneQuality("objects", PRESETS[1]);
    q.models.reason.on = false;
    q.models.segment.on = false;
    expect(laneAccuracy(q)).toBe(0);
    for (const [every, side] of [[2, 512], [10, 768], [30, 1024], [60, 1536]] as const) {
      expect(laneAccuracy({ ...laneQuality("objects", PRESETS[1]), every, side })).toBeGreaterThan(0);
    }
  });

  test("the budget is none, ok, near or over", () => {
    expect(budgetState({ cap: null, mode: "pause", spent: 9 }).state).toBe("none");
    expect(budgetState({ cap: 0, mode: "pause", spent: 9 }).state).toBe("none");
    expect(budgetState({ cap: 10, mode: "pause", spent: 2 }).state).toBe("ok");
    expect(budgetState({ cap: 10, mode: "pause", spent: 8 }).state).toBe("near");
    expect(budgetState({ cap: 10, mode: "warn", spent: 10 }).state).toBe("over");
  });
});

describe("SAM mode and skipped frames", () => {
  const work = { minutes: 1 };
  test("skipping look-alike frames lowers the bill and a little of the accuracy", () => {
    const all = laneQuality("objects", PRESETS[1]);
    const skip = { ...all, skip: 0.5 as const };
    expect(laneCost(skip, work).total).toBeLessThan(laneCost(all, work).total);
    expect(laneAccuracy(skip)).toBeLessThan(laneAccuracy(all));
    expect(laneAccuracy({ ...all, skip: 0.2 })).toBe(laneAccuracy(all) - 1);
  });

  test("whole-clip SAM is billed for every frame, at least 50, and tracks by id", () => {
    const images = laneQuality("objects", PRESETS[1]);
    const video = { ...images, mode: "video" as const };
    // 1 minute at 30 fps = 1,800 frames x $0.0002 x 2 concepts
    expect(laneCost(video, work).per.segment).toBeCloseTo(0.72);
    // A 1-second clip is still billed 50 frames.
    expect(laneCost(video, { minutes: 1 / 60 }).per.segment).toBeCloseTo(50 * 0.0002 * 2);
    expect(laneCost(images, work).per.segment).toBeCloseTo(6 * 0.0025 * 2);
    expect(laneAccuracy(video)).toBe(laneAccuracy(images) + 3);
    const off = { ...video, models: { ...video.models, segment: { ...video.models.segment, on: false } } };
    expect(laneAccuracy(off)).toBe(laneAccuracy({ ...images, models: off.models }));
  });
});
