# Version map

One file per planned release: what it ships, what must be true before it is tagged, and what waits.
`docs/ROADMAP.md` is the long-range plan. This folder turns it into releases. Every version serves the
hackathon goal in `docs/HACKATHON.md`: show Meta's AI working, and let visitors watch the replay.

| Version | Theme | Status |
| --- | --- | --- |
| [0.1.0](0.1.0.md) | First public release: sources become data products, end to end, tested | Released |
| [0.2.0](0.2.0.md) | ARGUS Studio: lanes first, data products on a playable timeline, SAM outlines, replays on Explore | Released |
| [0.3.0](0.3.0.md) | Breadth: real camera or RTSP, MQTT, scheduled polling, fuzzy entity matching | Planning |
| [0.4.0](0.4.0.md) | Video people census: count distinct people in a video, cut them out with SAM, replay with no API calls | Planning |
| 0.5.0 | Spatial: PostGIS joins, map products, the Data Fusion Canvas | Idea |

How a version moves:

1. **Idea**: a line in this table.
2. **Planning**: it has a file here with scope, exit criteria and a cut list.
3. **Frozen**: no new scope; only exit-criteria work lands.
4. **Released**: `bun run release x.y.z`, then the tag (see `docs/RELEASING.md`).

Rules for every version:

- Every new source writes Observations.
- Every new output is a manifest.
- Every new module comes with tests that keep the coverage gate green.
