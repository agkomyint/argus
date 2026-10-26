# Flows: the editable production line

A flow is plain JSON. People edit it in **Dashboard → Flows** (node editor). AI agents and scripts edit
the same JSON through the API, so either can craft the engine and the other can open and change it.

Rows travel along edges, left to right. Every row is a flat object. Sources emit
`{ id, type, time, confidence, ...payload }`.

## Nodes

| type | does | inputs (port) | params |
|---|---|---|---|
| `source` | **Data sources.** Newest rows a source delivered | none | `timeline` (a timeline, a `Timeline / Lane`, or a connected source name; empty = whole project), `obsType` (empty = every type), `limit` (≤500) |
| `filter` | keep rows where a field matches | `in` | `field`, `op` (`= != > >= < <= contains`), `value` |
| `sort` | order and keep the top N | `in` | `field`, `direction`, `limit` |
| `group` | group rows, emit `{key, value, n}` | `in` | `groupBy`, `metric`, `field` |
| `extract` | **Agent (AI).** pulls named fields out of each row | `in` | `fields` (comma list), `prompt`, `limit` (≤40) |
| `classify` | **Agent (AI).** adds `class` and `class_confidence` from your labels | `in` | `labels`, `prompt`, `limit` (≤40) |
| `track` | **Agent (code).** one row per entity: `count, first_seen, last_seen, span_minutes, avg_confidence` | `in` | `entity`, `timeField` |
| `normalize` | **Agent (code).** make one field consistent | `in` | `field`, `normOp` (`lowercase trim number round scale 0-1 iso time`), `digits` |
| `validate` | **Agent (code).** check a rule; drop failures or keep them with `valid`, `invalid_reason` | `in` | `field`, `rule` (`not empty, at least, at most, one of`), `value`, `mode` (`drop`/`keep and flag`) |
| `agent` | AI analyst: Meta reads up to N rows, returns claims `{text, numbers}` | `in` | `prompt`, `limit` (≤60) |
| `factcheck` | code: every number in a claim must appear in the evidence rows | `in` (claims), `ref` (evidence) | `keep` |
| `fuse` | **Fusion.** join two streams by time (and an optional shared field); partner fields come back as `b_*` plus `gap_minutes` | `a`, `b` | `joinKey`, `windowMin`, `unmatched` (`drop`/`keep`) |
| `layer` | **Fusion.** stack all connected rows into one named layer (`layer` column) | `in` (many edges allowed) | `layerName`, `keepFields` |
| `chart` | terminal: bar, line or number | `in` | `kind`, `x`, `y` |
| `publish` | **Save to product.** terminal: writes rows as the chosen product's observations | `in` | `product` (a product id; empty = custom), `publishType` (used when no product) |

Models propose, code decides: the `agent` node only writes claims; `factcheck` is deterministic.
A re-run of `publish` replaces that flow's earlier rows of the same type.

## Graph shape

```json
{
  "nodes": [{ "id": "n1", "type": "source", "x": 0, "y": 40, "params": { "obsType": "defect_detected", "limit": 100 } }],
  "edges": [{ "id": "e1", "from": "n1", "to": "n2", "port": "in" }]
}
```

Max 30 nodes. No cycles. Output nodes (`chart`, `publish`) cannot feed other nodes.

## API (session cookie of the signed-in user; scoped to the active project)

- `GET /api/flows` list · `POST /api/flows` `{name, graph?}` create
- `GET /api/flows/:id` · `PUT /api/flows/:id` `{name?, graph}` replace the graph (validated)
- `POST /api/flows/:id/run` run the saved graph
- `GET /api/flows/:id/output` latest finished run: charts, final tables, what was published

The editor also has **Draft with AI**: describe the flow in words and Meta drafts the graph, which you
can edit before saving.
