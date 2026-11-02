import { AppsWindow, type AppWindowApp } from "@/components/apps/apps-window";
import { AppTimeline, type AppLane } from "@/components/apps/app-timeline";
import { AppBuilder, type AppProduct } from "@/components/apps/app-builder";

/** Variants of the consumer-app shell for /design APP-01. */

const PRODUCTS: AppProduct[] = [
  { id: "shelf-interactions", name: "Shelf interactions", kind: "event-stream", observationTypes: ["shelf_event"], available: true, dial: { label: "held at least", unit: "s", value: 20 } },
  { id: "people-count", name: "People count", kind: "timeseries", observationTypes: ["people_count"], available: true, dial: { label: "more than", unit: "people", value: 3 } },
  { id: "object-tracks", name: "Object detection dataset", kind: "dataset", observationTypes: ["object_detected", "object_track"], available: true, dial: { label: "confidence", unit: "%", value: 60 } },
  { id: "speech-log", name: "Speech log", kind: "event-stream", observationTypes: ["transcript_turn"], available: true, dial: { label: "quiet for", unit: "min", value: 10 } },
  { id: "intelligence-api", name: "Intelligence API", kind: "api", observationTypes: [], available: true, dial: { label: "calls over", unit: "per hour", value: 100 } },
  { id: "vehicle-traffic", name: "Vehicle traffic", kind: "timeseries", observationTypes: ["vehicle_count"], available: false, dial: { label: "more than", unit: "vehicles", value: 40 } },
];

const title = "mb-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground";

export function AppStates() {
  return (
    <div className="grid gap-6">
      <div><p className={title}>One shell, three kinds: switch the kind (try it)</p><AppBuilder products={PRODUCTS} /></div>
      <div className="grid gap-6 xl:grid-cols-2">
        <div><p className={title}>Watcher · store theft, three alerts in this clip</p><AppBuilder products={PRODUCTS} start={{ kind: "watcher", name: "Store watch", reads: ["shelf-interactions", "people-count"], fired: 3 }} /></div>
        <div><p className={title}>Watcher · nothing fired</p><AppBuilder products={PRODUCTS} start={{ kind: "watcher", name: "Store watch", fired: 0 }} /></div>
        <div><p className={title}>Digest · daily floor summary</p><AppBuilder products={PRODUCTS} start={{ kind: "digest", name: "Daily floor summary", reads: ["shelf-interactions", "people-count"] }} /></div>
        <div><p className={title}>Tracker · live board with a goal</p><AppBuilder products={PRODUCTS} start={{ kind: "tracker", name: "Check-in streak", reads: ["people-count"] }} /></div>
        <div><p className={title}>Nothing picked: blocked</p><AppBuilder products={PRODUCTS} start={{ kind: "watcher", reads: [] }} /></div>
        <div><p className={title}>A product no lane feeds is shown off, not hidden</p><AppBuilder products={PRODUCTS} start={{ kind: "digest", name: "Weekly tracks", reads: [] }} /></div>
        <div><p className={title}>Browser alerts blocked: the alert is still kept in Delivery</p><AppBuilder products={PRODUCTS} start={{ kind: "watcher", reads: ["shelf-interactions"], fired: 1, blocked: true }} /></div>
        <div><p className={title}>Watcher with no products at all</p><AppBuilder products={[]} start={{ kind: "watcher", reads: [] }} /></div>
      </div>
    </div>
  );
}

const ACTORS: AppLane = {
  id: "actors", app: "Actor scenes", name: "Actors", icon: "person", reads: ["object_track", "scene_cut"], rule: "on screen after 3 s in a row",
  items: [
    { id: "a1", at: 4, to: 52, label: "Person 1", track: "Person 1", note: "SAM track 3, seen in 142 of 144 frames, 1 gap." },
    { id: "a2", at: 40, to: 118, label: "Person 2", track: "Person 2", note: "SAM track 7, seen in 230 of 234 frames." },
    { id: "a3", at: 96, to: 150, label: "Person 1", track: "Person 1", note: "Same label as the first span; SAM may have given a new id after the cut." },
  ],
};
const CUTS: AppLane = {
  id: "cuts", app: "Actor scenes", name: "Scenes", icon: "scene", reads: ["video_frame"], rule: "two sampled frames differ by more than 35%",
  items: [{ id: "c1", at: 0, to: 38, label: "Scene 1" }, { id: "c2", at: 38, to: 95, label: "Scene 2" }, { id: "c3", at: 95, to: 150, label: "Scene 3" }],
};
const LOST: AppLane = {
  id: "lost", app: "Lost object", name: "Left alone", icon: "object", reads: ["object_track", "people_count"], rule: "no person within reach for 30 s",
  items: [{ id: "l1", at: 61, to: 118, label: "Bag", severity: "high", track: "Bag", note: "Set down at 01:01. The last person near it left at 01:12." }, { id: "l2", at: 84, label: "Left alone", severity: "high" }],
};
const ALERTS: AppLane = {
  id: "alerts", app: "Store watch", name: "Alerts", icon: "alert", reads: ["shelf_interaction", "people_count"], rule: "item held 20 s, then left through the exit",
  items: [{ id: "s1", at: 22, label: "Held 34 s, left", severity: "high" }, { id: "s2", at: 87, label: "Held 21 s", severity: "low" }, { id: "s3", at: 131, label: "Held 40 s, left", severity: "high" }],
};

export function AppTimelineStates() {
  return (
    <div className="grid gap-6">
      <div><p className={title}>A media firm: Actor scenes on, click a span and name the person (try it)</p><AppTimeline duration={150} lanes={[CUTS, ACTORS]} start={{ selected: "a1" }} /></div>
      <div className="grid gap-6 xl:grid-cols-2">
        <div><p className={title}>Several apps on one timeline</p><AppTimeline duration={150} lanes={[CUTS, ACTORS, LOST, ALERTS]} /></div>
        <div><p className={title}>A person already named</p><AppTimeline duration={150} lanes={[ACTORS]} start={{ selected: "a2", names: { "Person 2": "Maya" } }} /></div>
        <div><p className={title}>Lost object: a bag left for a minute</p><AppTimeline duration={150} lanes={[LOST]} start={{ selected: "l1" }} /></div>
        <div><p className={title}>An alert marker</p><AppTimeline duration={150} lanes={[ALERTS]} start={{ selected: "s1" }} /></div>
        <div><p className={title}>App on, nothing found</p><AppTimeline duration={150} lanes={[{ ...ALERTS, items: [] }]} /></div>
        <div><p className={title}>No app switched on</p><AppTimeline duration={150} lanes={[]} /></div>
      </div>
    </div>
  );
}

const WINDOW_APPS: AppWindowApp[] = [
  { id: "store", name: "Store watch", kind: "watcher", reads: ["shelf-interactions", "people-count"], on: true, onTimeline: true, lane: ALERTS },
  { id: "lost", name: "Lost object", kind: "watcher", reads: ["people-count"], on: true, onTimeline: false, lane: LOST },
  { id: "floor", name: "Daily floor summary", kind: "digest", reads: ["shelf-interactions", "object-tracks"], on: true, onTimeline: false, lane: ALERTS },
  { id: "goal", name: "Visitors today", kind: "tracker", reads: ["people-count"], on: true, onTimeline: false, lane: { ...ALERTS, items: ALERTS.items.slice(0, 2) }, goal: 5, unit: "visitors" },
  { id: "actors", name: "Actor scenes", kind: "tracker", reads: ["speech-log"], on: false, onTimeline: false, lane: ACTORS },
];

const clone = (x: AppWindowApp[]) => x.map((a) => ({ ...a }));

export function AppsWindowStates() {
  return (
    <div className="grid gap-6">
      <div><p className={title}>The whole loop: press Apps to set an app up, read what it delivered in the Delivery tab, and see its lane on the timeline (try all three)</p><AppsWindow apps={clone(WINDOW_APPS)} products={PRODUCTS} duration={150} /></div>
      <div className="grid gap-6 xl:grid-cols-2">
        <div><p className={title}>Everything read: no new alerts</p><AppsWindow apps={clone(WINDOW_APPS)} products={PRODUCTS} duration={150} start={{ read: ["s1", "s2", "s3", "l2"] }} /></div>
        <div><p className={title}>Browser alerts blocked: alerts are still kept in Delivery</p><AppsWindow apps={[{ ...WINDOW_APPS[0], blocked: true }]} products={PRODUCTS} duration={150} /></div>
        <div><p className={title}>Nothing found</p><AppsWindow apps={[{ ...WINDOW_APPS[0], lane: { ...ALERTS, items: [] } }]} products={PRODUCTS} duration={150} /></div>
        <div><p className={title}>No apps yet</p><AppsWindow apps={[]} products={PRODUCTS} duration={150} /></div>
        <div><p className={title}>Data products tab is unchanged</p><AppsWindow apps={clone(WINDOW_APPS)} products={PRODUCTS} duration={150} start={{ tab: "Data products" }} /></div>
      </div>
    </div>
  );
}
