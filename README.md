# Archboard 3D

A draw.io-style editor for architecture diagrams, on an isometric 3D board. Components are raised tiles
with a real 3D model standing on them, arrows are right-angle connectors with flowing dots, and you can
spin the board a quarter turn at a time. A toggle switches to a flat, top-down 2D board with the
original 2D glyphs.

The look follows the **architecture board** style: one glyph per component type inside a dotted tile,
the name underneath, right-angle arrows with small label pills, the key path in an accent colour,
dashed lines for async or reply paths, and numbered purple step badges that tie the picture to a
written "How it works" list. The 39 components and the dark and light theme tokens come from that style: each
glyph exists as a hand-built 3D model (3D mode) and as the original flat drawing (2D mode).

## Access

The app opens on a passphrase screen, and no board is loaded or drawn until the right passphrase is entered.
Unlocking is remembered for the current browser tab only. To change the passphrase, compute a new hash with
`deriveKey("new passphrase")` from `src/security/passphrase.ts` and replace `PASSPHRASE_HASH`.

**This is a gate, not strong security.** The app runs entirely in the browser, so the check and its hash are
visible to anyone who can load the page, and a short passphrase can be guessed offline. Only a salted, 20,000
round hash is stored, never the passphrase. Boards you save are plain JSON, and the browser autosave in local
storage is not encrypted. For real protection, also put the site behind server-side authentication.

## Run it

```bash
npm install
npm run dev        # http://127.0.0.1:5173
```

```bash
npm test           # unit tests (routing, label placement, store, file format)
npm run build      # typecheck + production build into dist/
```

Needs a browser with WebGL.

## Using it

| Do this | How |
| --- | --- |
| Add a component | Click a glyph in the left palette, then click the floor. Or drag it onto the board. Shift keeps the glyph armed. |
| Move | Drag a tile. Positions snap to half cells. Shift+click or Cmd/Ctrl+A for several. |
| Connect | Press `C`, then drag from one tile to another (or click one, then the other). |
| Logic blocks | The "Logic" section has flowchart blocks: Decision / condition (an amber diamond, for branches: connect two arrows out of it and label them "yes" and "no"), Start / end, Process / step, Loop / retry, Fork / join, Timer / schedule and Event / trigger. |
| Networking | The "Networking" section has HTTP, REST API, WebSocket (two-way), Server-sent events (one-way stream) and Webhook, for labelling how components talk to each other. |
| Text boxes | Press `X` or click **Text**, then click the floor. Type the caption (Enter starts a new line). Drag to move. The right panel sets the size (small, medium, large) and draws an optional box around it. Text boxes always face you, in 2D and 3D, and appear in the PNG. Arrows connect components, not text. |
| Remove all | **Clear** in the toolbar removes every component, arrow and text box after a confirmation. It keeps the board title and the step list, and Cmd/Ctrl+Z brings everything back. **New** also resets the title and steps and cannot be undone. |
| Edit | Select a tile, arrow or text box. The right panel edits name, type, position, arrow label, step badge, key path, dashed. Double click renames. |
| Steps | Write the story in "How it works" (one line per step). Number arrows with step badges. A warning shows if a badge has no line. |
| 2D or 3D | Click the 3D / 2D switch in the toolbar, or press `T`. 3D is the isometric board with 3D models. 2D is a flat top-down board with the 2D glyphs. The camera glides between them, rotating 45 degrees and back, and your choice is remembered. |
| Look around | Drag empty floor, or right/middle drag, or Space+drag to pan. Wheel zooms. `Q` / `E` rotate the view. `F` fits the board. |
| Undo | Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z to redo. One drag or one burst of typing is one step. |
| Duplicate / delete | Cmd/Ctrl+D, Delete. Deleting a tile removes its arrows. |
| Save and share | Save writes a `.archboard.json` file, Open reads one, PNG exports a tightly cropped image of the whole board from the current angle. The board also autosaves in the browser. |

## File format

Plain JSON, version 1:

```json
{
  "version": 1,
  "title": "Ticketing: held seats",
  "nodes": [{ "id": "gw", "gx": 1, "gy": 1.5, "icon": "gateway", "label": "LB / Gateway" }],
  "edges": [{ "id": "e1", "from": "cl", "to": "gw", "label": "join queue", "step": 1, "hot": true, "dash": false }],
  "texts": [{ "id": "t1", "gx": 2, "gy": 5, "text": "Backend services", "size": "m", "boxed": true }],
  "steps": ["The waiting room admits users in batches."]
}
```

`gx` and `gy` are grid cells (half cells allowed). `size` is `"s"`, `"m"` or `"l"`, and `texts` is optional in older files. Icons are the glyph keys listed in
`src/model/types.ts`. Unknown icons fall back to a service glyph, and arrows that point at missing
tiles are dropped on load.

## How it is built

TypeScript, Vite and Three.js. No UI framework. Three layers, each usable without the one above it:

- `src/model/` has the document, selection and undo history (snapshot based), and file parsing. No DOM, no Three.js.
- `src/glyphs/` has the components: `models.ts` builds the 39 3D models from primitives, `flatIcons.ts` holds the original 2D drawings,
  and `thumbs.ts` renders the palette and legend pictures.
- `src/security/` has the passphrase gate (a self-contained SHA-256, the salted hash, and the screen).
- `src/scene/` has the 3D view. `routing.ts` and `labels.ts` are pure and unit tested: they route arrows
  around tiles in lanes, and place label pills in screen space so they avoid tile names and each other.
  `sceneView.ts` owns the renderer, the isometric orthographic camera and picking.
- `src/ui/` and `src/interaction/` have the DOM panels, and the controller that turns pointer and keyboard
  input into edits.

3D models are lit geometry with their own materials, and each turns to face the viewer as the board rotates so thin
models such as a phone or card never go edge-on. The 2D glyphs are SVG, rasterised once into textures.

## Known limits

- Models turn to face the viewer, so there is no per-tile rotation. Rotating the view is the rotate feature.
- No groups, regions or containers yet, and no traffic simulation. Both build on this editor.
- Arrow routing is automatic. You steer it by moving tiles, not by dragging bend points.
