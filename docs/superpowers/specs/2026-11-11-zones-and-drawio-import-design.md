# Zones, cloud glyphs and draw.io import

Status: approved by the user in chat (scope, zone behaviour, import behaviour, mapping in code, build now). Built.

## Goal

Open a draw.io (`.drawio`) diagram and get an Archboard 3D board that looks as close to it as the component
set allows. Draw.io diagrams group components inside tinted rounded rectangles (for example a "BFF layer" or
"Middleware" box), so the board first needs that concept: **zones**. Cloud diagrams use vendor icons, so the
component set grows with cloud equivalents, and a **mapping table** sends vendor services to the closest
component.

## Non goals

- Round tripping (exporting back to draw.io).
- Importing images or custom stencils as pictures. Anything not recognised becomes a Service tile.
- Edge waypoints. Our arrows are routed with right angles by the board.
- Runtime editable mapping. The table lives in source (`src/import/iconMap.ts`).

## 1. Zones

`ZoneData { id, gx, gy, w, h, label, color }`

- `gx, gy`: top left corner of the zone in grid cells, in the same units as a tile centre. `w, h`: size in
  cells. All snapped to half cells. `w, h >= 1`. `color`: `#rrggbb`.
- `DocData.zones` is optional in files. Older files load with no zones. Saved boards always write the array.
- Drawn as a rounded rectangle lying on the floor below tiles and arrows: fill at 16% opacity (22% in the
  dark theme), a 1 px outline at 70%, and the label as a screen facing sprite near the back corner. It is
  not part of tile hit testing and never blocks a click on a tile.
- 2D and 3D both use the same flat mesh.
- Included in fitting the view, auto-rotate framing, PNG and GIF bounds.

### Interaction

- **Zone tool** (toolbar button, key `Z`). Drag on the floor to draw a zone, or click for a default 6 x 4 cell zone.
  The new zone is selected, then the tool returns to Select (Shift keeps it).
- **Picking.** A zone is picked by its outline band (within 0.35 cell of the edge) or its label. Clicking the
  empty inside of a zone does not pick it, so panning and deselecting still work over a zone.
- **Resize.** A selected zone shows four corner handles. Dragging one resizes (minimum 1 x 1).
  The inspector also has Column, Row, Width and Height fields.
- **Inspector.** Label, colour (8 swatches and a custom colour input), geometry, Duplicate, Delete.
- **Delete** removes the zone only. Duplicate copies the zone only (offset one cell).

### Membership and moving

Membership is computed from positions, never stored. For a zone Z:

- A **tile** is a member when its centre is inside Z expanded by **0.5 cell** on every side. A gateway sitting
  on the border (the entry point to a zone) is therefore a member and moves with it.
- A **text box** is a member when its centre is inside Z (no expansion).
- A **zone** is a member when it lies fully inside Z.

Dragging a zone moves it together with its members. Holding **Alt** (Option) while pressing the zone moves the
zone alone. A drag is blocked, as for tiles, if a member tile would land on a tile that is not moving.
Moving the zone, resizing and editing all go through the store, so each is one undo step.

Other behaviour:

- Select all includes zones. Clear all removes zones. The item count includes zones.
- A zone nested in another zone draws on top of the larger one (smaller area draws later).
- Deleting a tile never touches zones.

## 2. Cloud glyphs

Fourteen new components with a 3D model and a 2D icon each, in a new palette group **Cloud** (63 in total):

| Key | Name | Meant for |
|---|---|---|
| lambda | Function / serverless | Lambda, Cloud Functions, Azure Functions |
| container | Container | Docker, ECS task, Cloud Run, container instance |
| cluster | Cluster / Kubernetes | EKS, GKE, AKS, Kubernetes |
| dns | DNS / domain | Route 53, Cloud DNS |
| warehouse | Data warehouse | Redshift, BigQuery, Snowflake, Synapse |
| alarm | Monitoring / alarm | CloudWatch, Stackdriver, alerts |
| key | Key / secrets | KMS, Secrets Manager, Key Vault |
| identity | Identity / IAM | IAM, Cognito, Entra ID, SSO |
| firewall | Firewall / WAF | WAF, Shield, Cloud Armor, security groups |
| network | Virtual network | VPC, VNet, subnet, peering |
| etl | Data pipeline / ETL | Glue, Dataflow, Data Factory, Airflow |
| iot | IoT device | IoT Core, sensors |
| archive | Archive / backup | Glacier, backups |
| files | File storage | EFS, Filestore, NFS, file share |

The existing set already covers: queue (SQS, Pub/Sub, Service Bus, Kafka), bell (SNS), db, redis, blob (S3),
cdn, gateway (ALB, API Gateway), es (OpenSearch), vector, lock, mail, ai/llm, chart, server, svc, filter.

All keep the glyph conventions: stand on y = 0, fit a 1.3 x 1.3 footprint, at most 1.3 tall, front faces +z,
and are solid in all three dimensions.

## 3. draw.io importer

Pure TypeScript in `src/import/`, no DOM, so it runs under the unit tests.

### Reading

1. `parseXml` is a small XML reader (elements, attributes, entities, comments, CDATA). No `DOMParser`.
2. `readDrawio(text)` accepts an `<mxfile>` with one or more `<diagram>`, a bare `<mxGraphModel>`, or the
   compressed form (base64, raw deflate, URL encoded). Decompression uses `DecompressionStream("deflate-raw")`
   and is capped at 8 MB of output. `listPages(text)` returns page names so the UI can ask which one.
3. Labels: HTML labels (`html=1`) are turned into plain text. `<br>`, `</div>`, `</p>` become line breaks,
   other tags are dropped, entities decoded twice (draw.io escapes the markup inside the attribute).

### Understanding cells

- Cells with `visible="0"` are skipped. A cell's parent chain gives its absolute position: child geometry is
  relative to a parent vertex (container, group, swimlane) and absolute when the parent is a layer.
- **Edge** (`edge="1"`): needs a source and a target that both end up as tiles. Otherwise it is skipped and counted.
  `endArrow` / `startArrow` decide the direction: heads at both ends set `both`; a start head only reverses the
  arrow; `dashed=1` sets `dash`. The label is the edge value, or the first child edge label cell.
  Two arrows between the same pair in opposite directions with equal labels merge into one two way arrow.
  Duplicate arrows are dropped.
- **Text** (style starts with `text`, or `shape=text`, or no fill and no stroke with a label and no vertex
  inside it): becomes a text box at its centre.
- **Zone**: a `swimlane` or `container=1` vertex, or a plain box (not a vendor stencil, cylinder, cloud, actor
  and so on) with two or more components inside it and more than twice their area, or with one component
  inside it and more than nine times its area (so a card with a small badge stays a component). A `group`
  vertex draws nothing, so it is not a zone and its children stay as they are. Label is the cell label. Colour is `fillColor`, else `strokeColor`, else a default.
- **Tile**: everything else. Label is the cell label. Icon from the mapping.

### Icon mapping (`src/import/iconMap.ts`)

An ordered list of rules `{ icon, style?: RegExp, label?: RegExp }`. A cell is tested in three passes, first
match wins in each pass:

1. **Vendor style.** The lowercase style string (this includes `shape=mxgraph.aws4.sns`, `resIcon=...`,
   `image=...`) against the rules' `style` patterns.
2. **Label keywords.** The label against the rules' `label` patterns, which also hold product names.
3. **Generic shape.** `cylinder` to db, `cloud` to cdn, `actor` to person, `rhombus` to decision, `hexagon`
   to process, `document` to doc, `mxgraph.flowchart.*` to the matching logic glyph, `ellipse` with a short
   label such as Start or End to start/end, and so on.
4. Otherwise `svc`. Plain rectangles become `svc` too.

`store.replace(doc)` is new: it swaps the whole document as one undoable `mutate` step (unlike `load`, which
clears history).

The number of tiles that fell through to the fallback is reported.

### Layout

- Positions are absolute centres in draw.io pixels. One scale factor `cellPx` maps pixels to grid cells: the
  median distance from each tile to its nearest tile maps to 1.5 cells, clamped to `[40, 400]` pixels per cell.
- Positions snap to half cells. Overlapping tiles (both axes closer than `NODE_MIN_GAP`) are moved to the nearest
  free half cell, searching outwards.
- Zones: scaled box snapped outward to half cells, then grown so it still covers every member tile (centre
  plus 0.75 cell) after nudging. Zone size is at least 2 x 2.
- The whole result is shifted so its top left is near the origin.
- Limits: at most 400 tiles. More than that is an error with a clear message.

### Application

`importDrawio(text, pageIndex)` returns `{ doc: DocData, report }`. The report counts tiles, zones, text boxes,
arrows, arrows skipped and tiles that used the fallback icon, plus the page name. The UI:

1. Import button, file picker (`.drawio`, `.xml`).
2. If the file has more than one page, ask which one (a numbered prompt).
3. If the board is not empty, confirm replacing it.
4. Replace the board through one undoable store step (`store.replace`), fit the view, and show the report as a
   toast. The title becomes the page name.

## 4. Testing

- Zones: parse and serialise, bad sizes, older files without zones, membership rules (inside, border, outside,
  nested), move with members, Alt style move alone, blocked moves, undo.
- Glyphs: the existing model, flat icon and palette tests cover every key automatically.
- Importer: XML reader, entities, compressed round trip, HTML label clean up, classification (tile, text, zone,
  swimlane), nested absolute positions, edge directions and merging, layout scale and overlap resolution,
  mapping rules for AWS, GCP, Azure examples, fallback count, limits.

## Self review: gaps found and how they are closed

| Gap | Decision |
|---|---|
| Clicking inside a zone must not stop panning or deselecting | Pick by outline band and label only |
| A gateway on a zone border | 0.5 cell tolerance for membership, Alt moves the zone alone |
| Moving a zone could push a member tile onto a stranger tile | Same blocked move rule as tiles |
| Zones in fit, PNG and GIF framing | Included in `boardBounds` and `groundCentre` |
| Arrow whose end is a container | Skipped and counted in the report |
| Compressed draw.io pages | `DecompressionStream`, 8 MB cap, clear error if unsupported |
| Labels with HTML | Converted to plain text, no HTML ever reaches the page |
| Import replacing work | Confirmation when the board is not empty, one undo restores it |
| Huge diagrams | 400 tile limit with a message |
| Missing fill in draw.io means the default white fill, not "no fill" | Only an explicit `fillColor=none` and `strokeColor=none` makes a text shape |
| Zone colour in dark theme | Fixed low opacity fill works on both, label sprite uses a darkened or lightened tint of the zone colour for contrast |
| Zone and arrow label overlap | Zones are below everything and labels sit in screen space, no extra handling |
| Legend and steps | Unaffected; zones are not components |
| Saved file compatibility | `zones` optional on read, `version` stays 1 |
