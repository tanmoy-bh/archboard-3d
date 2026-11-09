# Archboard 3D

A draw.io-style editor for architecture diagrams, on an isometric 3D board. Components are raised tiles
with a standing glyph, arrows are right-angle connectors with flowing dots, and you can spin the board
a quarter turn at a time.

The look follows the **architecture board** style: one glyph per component type inside a dotted tile,
the name underneath, right-angle arrows with small label pills, the key path in an accent colour,
dashed lines for async or reply paths, and numbered purple step badges that tie the picture to a
written "How it works" list. The 27 glyphs and the dark and light theme tokens are the ones that style defines.

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
| Edit | Select a tile or arrow. The right panel edits name, type, position, arrow label, step badge, key path, dashed. Double click renames. |
| Steps | Write the story in "How it works" (one line per step). Number arrows with step badges. A warning shows if a badge has no line. |
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
  "steps": ["The waiting room admits users in batches."]
}
```

`gx` and `gy` are grid cells (half cells allowed). Icons are the glyph keys listed in
`src/model/types.ts`. Unknown icons fall back to a service glyph, and arrows that point at missing
tiles are dropped on load.

## How it is built

TypeScript, Vite and Three.js. No UI framework. Three layers, each usable without the one above it:

- `src/model/` has the document, selection and undo history (snapshot based), and file parsing. No DOM, no Three.js.
- `src/scene/` has the 3D view. `routing.ts` and `labels.ts` are pure and unit tested: they route arrows
  around tiles in lanes, and place label pills in screen space so they avoid tile names and each other.
  `sceneView.ts` owns the renderer, the isometric orthographic camera and picking.
- `src/ui/` and `src/interaction/` have the DOM panels, and the controller that turns pointer and keyboard
  input into edits.

Glyphs are SVG, rasterised once into textures, so they stay crisp and are reused in the palette and legend.

## Known limits

- Glyphs are standing sprites, not true 3D models. They always face the camera, so there is no per-tile
  rotation. Rotating the view is the rotate feature.
- No groups, regions or containers yet, and no traffic simulation. Both build on this editor.
- Arrow routing is automatic. You steer it by moving tiles, not by dragging bend points.
