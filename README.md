# Tether

Graph layout and physics on plain arrays: no DOM, no dependencies. It positions a graph's nodes and keeps them
moving believably afterwards. [Prism](https://github.com/BrettWhitson/prism) draws what it positions.

- **Layouts:** a tidy tree, a layered (Sugiyama-style) layout for DAGs and graphs with cycles, and a radial tree,
  each leaving room for node labels. Directional layouts flow any way: TB, BT, LR or RL.
- **Physics:** a force simulation (`physics.js`) with Barnes–Hut repulsion, link springs, centering, a pull that
  keeps a layout's levels or rings, and box collisions. It polishes every layout, and in "floating" mode keeps the
  whole graph live.
- **Dragging:** an elastic network (`elastic.js`): the held node pulls its neighbours, they pull theirs, and the pull
  fades with every link, so the rest of the graph stays put.
- **Live physics** (`live-physics.js`): everything after the layout in one place. Tell it what the pointer does
  (grab, drag, release), or shake it, and call `step()` each frame while it's `active`; it returns what moved, in
  either mode (elastic or floating).

```js
import { LayoutGraph } from "tether/layout-graph.js";
import { runLayout } from "tether/run-layout.js";

// Nodes: { id, w, h, fullW?, fullH?, root? } (fullW × fullH: the node with its label).
// Edges run parent → child: { source, target }.
const graph = new LayoutGraph(nodes, edges);
const simulation = runLayout(graph, {
  direction: "TB", // or "BT", "LR", "RL", "radial"
  layered: false, // true: always the layered layout (for graphs with shared nodes)
  physicsMode: "elastic", // or "floating"
  centerForce: 0.2,
  repelForce: 8,
  linkForce: 0.5,
  linkDistance: 120,
});
graph.positionOf("a"); // { x, y }
```

`runLayout` returns the force simulation. Hand it to `LivePhysics` to drag and animate the graph afterwards:

```js
import { LivePhysics } from "tether/live-physics.js";

const physics = new LivePhysics(settings);
physics.simulation = simulation;
physics.grab("a", { ids, links: edges, positionOf }); // positionOf(id): where it's drawn now
physics.drag("a", { x: 300, y: 120 }); // as the pointer moves; physics.release("a") when it lets go

function frame() {
  draw(physics.step().moved); // [[id, x, y], …]
  if (physics.active) requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
```

Every constant behind the forces is in `tuning.js` (`PHYSICS_TUNING`, with `TUNING_OPTIONS` describing each one for developer tools).

## Development

```sh
npm install
npm run verify   # lint, prettier, tests
```
