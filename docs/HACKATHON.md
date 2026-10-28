# Meta AI Hackathon 2026: goal

**ARGUS is a showcase, not a platform pitch.** The goal is to show what Meta's AI models can do when
they work together on real data: vision, segmentation, reasoning and verification, end to end. We
run the analyses. Visitors watch them as replays.

## What a visitor gets

- A few finished analyses that we ran ourselves, each one a story. Bridge Intelligence and the video
  people census (`docs/version-map/0.4.0.md`) are examples.
- A replay of each one on `/explore`, step by step: which model looked at what, what it proposed,
  what code computed from it, and how the result built up.
- Every number on screen traces back to an Observation and the model response behind it.

## What a visitor does not need

- No sign-up, no upload, no setup, no API key.
- **No model calls.** Replays read only what was stored, so a thousand visitors cost nothing and see
  exactly the run we recorded.

## How this shapes the work

1. **Show the AI working, not just the answer.** Each Meta model step is visible in the replay, with
   its input frame or data, its raw proposal, and what code did with it.
2. **The replay is the product.** If a feature cannot be seen in a replay, it is not hackathon work.
3. **Record, then replay.** Every model response is stored with its model id and request hash.
   Replay never imports `@/lib/meta`, and a test proves it makes zero model calls.
4. **Breadth of Meta models over breadth of connectors.** One more model in a story beats one more
   source type.
5. **Honest numbers.** Models propose, code computes, and estimates are labelled as estimates.
6. **Only show what we may show.** Public replays use footage and data we have the right to publish.
   A copyrighted video (for example a MrBeast episode) can be analyzed privately, but its frames and
   cut-outs do not go on a public page. For the public showcase, use our own or openly licensed footage.

## Demo checklist

- [ ] Each showcase story has a recorded run and a public replay on `/explore`
- [ ] The landing page leads to the replays in one click
- [ ] Each replay names the Meta models it used, at the step where they were used
- [ ] Replays load with `META_API_KEY` unset (proves nothing is called)
- [ ] A recorded fallback clip exists for each live demo
