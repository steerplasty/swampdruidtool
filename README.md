# swampdruidtool

A free, browser-based landscape design tool. Trace a property over a Google Maps screenshot or a survey, then lay out the landscape to scale. No accounts and nothing stored online: plans are exported as `.sdt` files and opened again later.

Built for desktop and laptop browsers.

## Phase 1 (this release)

- Import a background: PNG/JPG screenshot, survey PDF (pick the page), drag and drop, or paste with Ctrl V
- Two-point scale: click both ends of a known distance and type its length
- Rotate, move, fade, hide and lock the background
- Property line, house, other buildings, driveway, patio/walk, existing trees
- Real-scale surface textures (concrete, asphalt, pavers in four colors, gravel)
- Layered tree symbols (broadleaf, palm, pine) with color choices
- Measure tool and saved dimension lines
- Snapping to corners, midpoints and edges; Shift locks angles; type a length + Enter for exact sides
- Rectangle mode for buildings at any angle (type `40x30`)
- Undo / redo, existing / proposed / remove status, layers with show/lock
- Export / open `.sdt` files, plus a recovery copy kept in this browser only

## Run it locally

It is a static site with no build step. Serve the folder with any web server, for example:

```
python3 -m http.server 8000
```

then open http://localhost:8000. (Opening `index.html` straight from disk will not work, because browsers block ES modules on `file://`.)

## Put it on GitHub Pages

1. Create a repository named `swampdruidtool` and upload everything in this folder (keep the folder structure).
2. In the repo: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, branch `main`, folder `/ (root)`.
3. After a minute it is live at `https://<your-username>.github.io/swampdruidtool/`.

The `.nojekyll` file tells GitHub Pages to serve the files exactly as they are.

## Project layout

```
index.html            page shell
css/app.css           all styling
src/main.js           start-up, toolbar, shortcuts, file handling
src/core/             project data (store), view/zoom, geometry, units, snapping, type registry
src/render/           drawing the plan, material textures, plant/tree symbols
src/tools/            one tool per file: select, polygon drawing, tree, measure, dimension, scale
src/ui/               sidebar panels, dialogs, toasts, icons
src/io/               .sdt export/open, background import, browser recovery copy
vendor/               Konva (canvas), JSZip (.sdt files), pdf.js (survey PDFs), kept locally so it works offline
sw.js, manifest.json  offline support / install as an app
```

## Data model

All geometry is stored in **feet**. The view only applies zoom and pan when drawing, so measurements never depend on screen size.

Every object has the same shape:

```json
{ "id": "obj_ab12cd", "type": "site.house", "layer": "site",
  "geometry": { "kind": "polygon", "points": [[0,0],[40,0],[40,30],[0,30]] },
  "props": { "label": "House", "showArea": true },
  "status": "existing" }
```

New object types are added in `src/core/types.js` plus a draw function in `src/render/render.js`.

`.sdt` files are zip files holding `project.json` and the background images. Each file carries `schemaVersion`; `src/io/project-file.js → migrate()` upgrades older files when the format changes.
