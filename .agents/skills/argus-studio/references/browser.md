# Studio navigation with Playwright

Use the available browser runtime and its documented initialization, upload, screenshot, and permission APIs. Examples describe UI actions; they do not authorize unrelated tabs, raw cookies, hidden app state, or arbitrary browser JavaScript.

`page` below is a standard Playwright Page. A connected browser may expose equivalent locators under `tab.playwright`; adapt only to its documented API. With CUA, get the tab through its discovery/selection API first. Use DOM snapshot roles for Playwright: ARGUS product cards are `button[aria-pressed]` even when native accessibility reports them as checkboxes.

## Routes and windows

| Destination | Purpose |
| --- | --- |
| `/projects` | Account/project chooser, New project, Open in Studio |
| `/studio/<id>` | Owner's project; Lanes, Products, Observatory, Agents menu windows |
| `/explore` | Shared project list |
| `/explore/<slug>` | Public recorded replay, no sign-in or model calls |
| `/design` | Component variants, not live project data |
| `/design#stu-10` | Camera-state preview in this revision |

Verify the visible signed-in account. Open the target project's **Open in Studio →** action from Projects to select its active workspace for uploads. Verify heading/URL before changing anything. Prior demo accounts/project ids are not defaults. Menus open dialogs over Studio, not dashboard routes; scope selectors to the visible dialog. An empty Studio may open Lanes automatically.

## Create without setup-model calls

After a fresh DOM snapshot, the current manual path is:

```ts
await page.getByRole("button", { name: "New project", exact: true }).first().click();
await page.getByRole("button", { name: "pick products myself", exact: true }).click();
const dialog = page.getByRole("dialog", { name: "New project", exact: true });
await dialog.getByLabel("Project name", { exact: true }).fill("Field notebook");
await dialog.getByRole("button", { name: /^Object detection dataset Structured/ }).click();
await dialog.getByRole("button", { name: /^Speech log What/ }).click();
await dialog.getByRole("button", { name: "Create without lanes", exact: true }).click();
```

The label is **Project name**, not the uppercase visual styling. `#setup-name` is a fallback verified in `src/components/workspace/setup-steps.tsx`. Product button names contain summaries; inspect current DOM text instead of assuming wording stays fixed. Inspect `aria-pressed` before toggling an already selected card. Wait for creation/navigation and verify the new name/id; a disabled submit button is not completion. If creation returns to Projects, use Open in Studio.

The AI alternative is **What do you want to track? → Suggest products → Plan lanes**. It invokes models and proposes a plan; deterministic code still validates it. General-project plan setup currently creates file lanes. Use Lanes for live inputs.

## Enable a product in Studio

```ts
await page.getByRole("navigation", { name: "Studio menu" })
  .getByRole("button", { name: "Products", exact: true }).click();
const dialog = page.getByRole("dialog", { name: "Products", exact: true });
const row = dialog.getByRole("listitem").filter({
  has: page.getByText("Speech log", { exact: true }),
});
await row.getByRole("button", { name: "Add", exact: true }).click();
```

Only click Add if present; Added means already enabled. Verify saved state, close the dialog, and inspect the panel. A zero-row panel is expected until input exists. Mask products can start SAM backfill: inspect Observatory before calling them ready. Avoid global selectors matching both the picker and panels behind it.

## Create lanes and feeds

Open **Lanes**. With existing lanes, choose **New lane → set it up yourself**; with none, the first-lane editor is visible already.

- Fill **Lane name** and optional **What these files are**.
- **Comes from** buttons: Files, Camera, Screen share, Weather feed, Sensor, Webhook.
- Files exposes **Reads with**: Find objects, Body check-in, Persona panel, Transcribe speech. These are pressed buttons, not a select/checkbox.
- Camera fixes the analyzer to objects. Audio is Files + Transcribe speech, not an Audio input.
- **Feeds** chips list compatible enabled products. Select intended feeds, inspect validation messages, click **Make lane**, and verify the saved card/feeds.
- Open the lane card to inspect its files and feeds. **Back to all lanes** returns. The left rail's **Set up <lane-name>** opens live controls in place.

Useful locators after checking the DOM: `getByLabel("Lane name")`, `getByLabel("What these files are")`, and scoped buttons `Files`, `Transcribe speech`, `Make lane`. Body uploads expose a calendar day: preserve the person's intended date.

Weather setup requires Latitude, Longitude, Save. Sensor requires Asset name and optionally a simulated surge; Run now polls a ready connector. Saving connector settings can trigger work. Webhook setup displays its ingest path/key: exclude keys from logs/screenshots.

## Upload and capture

Use the rail's **Add files to <lane-name>** control. Standard Playwright can handle the chooser or a verified file input. Connected browsers have their own upload documentation and supported chooser APIs; read those before uploading.

```ts
// Standard Playwright example; adapt events to the browser tool's documented API.
const pending = page.waitForEvent("filechooser");
await page.getByRole("button", { name: "Add files to Field recordings", exact: true }).click();
const chooser = await pending;
await chooser.setFiles(authorizedLocalFilePath);
```

Do not use page evaluation to construct Files, mutate React state/localStorage, call server actions, or issue authenticated requests. Use UI controls or the real connector/API. Do not replace the intended authenticated session with a second browser profile.

Wait for normalization/upload/frame sampling to finish, then verify ready files, Observations, and traces. Sampling can continue after storage reaches 100%. Prefer the browser path for audio/video: it handles codec decoding, canonical WAV conversion, sampling, progress, and reports.

Camera controls are **Set up <lane> → Start camera → Stop and save**. Capture must match the user's request and runtime permissions. Do not start it just to prove configuration exists. Keep controls mounted through capture/save: closing them stops tracks and may discard unsaved recording. Setup-only work is complete with a ready lane, compatible feeds, and camera still off.

## Inspect and replay

- Observatory shows model/code/tool steps, success/error, model ids, and written Observation ids. Error text and filenames may be private.
- Totals follow the **playhead**. Selecting an older file seeks to its completion and can hide later speech/product rows. Zero then does not mean deleted data.
- To see complete results, focus **Seek** and press **End**. To retain an image preview with final totals, select the image first, then seek to End.
- **open all** expands products, but long widgets push later panels below the right dock's scroll area. Use a specific panel/full-size button to inspect it.
- Preview/steps support minimize/maximize/restore; layout persists in the browser. Restore the split before concluding content is missing.
- Public `/explore/<slug>` should show PUBLIC REPLAY, expected products/media, and no new model calls. Verify anonymous access without signing out the owner if an isolated client is available.

## Sharing

Only publish within the user's requested scope. Open **Share <project-name>** and inspect the disclosure. A separate **Also show media** checkbox controls media; audio is included even though some UI copy only lists photos/video/screen frames. Use actual sharing intent and provenance, not a generic demo recipe, to decide whether to enable it.

The agreement is a real checkbox. After observing the dialog, a scoped `getByRole("checkbox", {name:/I agree to make/})` avoids apostrophe/case problems in wrapper selectors. Click **Share publicly**, verify the **is public** heading, and read the returned URL. Do not invent a slug or imply publication deployed the app. `localhost` is inaccessible to remote judges.

Stopping and resharing changes the slug. Hiding media or stopping sharing deletes kept screen frames, so it is not a harmless test toggle. New uploads to an already shared project may become public under its current media policy. Body photos stay excluded. Follow task authorization and runtime confirmation requirements for publishing/deletion.

Capture a resulting screen using the runtime screenshot facility when visual verification matters; return the actual link and any unverified step. Do not call a loading screen a passed browser check.
