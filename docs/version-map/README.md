# Version map

One file per planned release: what it ships, what must be true before it is tagged, and what waits.
`docs/ROADMAP.md` is the long-range plan. This folder turns it into releases.

| Version | Theme | Status |
| --- | --- | --- |
| [0.1.0](0.1.0.md) | First public release: sources become data products, end to end, tested | Released |
| 0.2.0 | Breadth: real camera or RTSP, MQTT, scheduled polling, fuzzy entity matching | Idea |
| 0.3.0 | Spatial: PostGIS joins, map products, the Data Fusion Canvas | Idea |

How a version moves:

1. **Idea**: a line in this table.
2. **Planning**: it has a file here with scope, exit criteria and a cut list.
3. **Frozen**: no new scope; only exit-criteria work lands.
4. **Released**: `bun run release x.y.z`, then the tag (see `docs/RELEASING.md`).

Rules for every version:

- Every new source writes Observations.
- Every new output is a manifest.
- Every new module comes with tests that keep the coverage gate green.
