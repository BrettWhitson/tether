// The physics after the layout: dragging in both modes, shaking, floating in, stopping.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LayoutGraph } from "../src/layout-graph.js";
import { runLayout } from "../src/run-layout.js";
import { LivePhysics } from "../src/live-physics.js";

const LINKS = [
  ["root", "a"],
  ["root", "b"],
  ["a", "c"],
  ["a", "d"],
  ["b", "e"],
].map(([source, target]) => ({ source, target }));
const IDS = ["root", "a", "b", "c", "d", "e", "loner"];

/** A laid-out graph and physics on it; `positions` is what a renderer would be showing. */
function setUp(physicsMode, settle = true) {
  const settings = {
    direction: "TB",
    physicsMode,
    centerForce: 0.2,
    repelForce: 8,
    linkForce: 0.5,
    linkDistance: 120,
  };
  const graph = new LayoutGraph(
    IDS.map((id, i) => ({ id, w: 40, h: 40, root: i === 0 })),
    LINKS,
  );
  const physics = new LivePhysics(settings);
  physics.simulation = runLayout(graph, settings, { settle });
  const positions = new Map(IDS.map((id) => [id, graph.positionOf(id)]));
  const positionOf = (id) => ({ ...positions.get(id) });
  /** Step until still (or `frames` run out), applying what moved; returns the frames taken. */
  const run = (frames = 2000) => {
    let n = 0;
    while (physics.active && n++ < frames)
      for (const [id, x, y] of physics.step().moved)
        positions.set(id, { x, y });
    return n;
  };
  const graphOnScreen = { ids: IDS, links: LINKS, positionOf };
  return { physics, settings, positions, positionOf, run, graphOnScreen };
}

const distance = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);

test("elastic: a dragged node pulls its neighbours, the pull fades by link, and the unlinked stay put", () => {
  const { physics, positions, positionOf, run, graphOnScreen } =
    setUp("elastic");
  const start = new Map(IDS.map((id) => [id, positionOf(id)]));
  physics.grab("a", graphOnScreen);
  assert.ok(physics.active);
  const target = { x: start.get("a").x + 200, y: start.get("a").y };
  positions.set("a", target); // the renderer moves the held node itself
  physics.drag("a", target);
  run();
  physics.release("a");
  run();
  assert.equal(physics.active, false);
  assert.equal(physics.elasticNet, null, "let go and still: the net is done");

  const moved = (id) => distance(positions.get(id), start.get(id));
  assert.ok(moved("c") > 20, "a child follows");
  assert.ok(moved("root") > 1, "the parent gives a little");
  assert.ok(moved("c") > moved("e"), "two links away moves less than one");
  assert.equal(moved("loner"), 0, "not linked: not moved");
});

test("floating: grabbing wakes the whole simulation, and it settles after release", () => {
  const { physics, positions, positionOf, run, graphOnScreen } =
    setUp("floating");
  const start = positionOf("a");
  physics.grab("a", graphOnScreen);
  const target = { x: start.x + 150, y: start.y + 40 };
  positions.set("a", target);
  physics.drag("a", target);
  for (let i = 0; i < 30; i++) physics.step();
  assert.ok(physics.active, "still live while held");
  physics.release("a");
  const frames = run();
  assert.equal(physics.active, false, `settled (after ${frames} frames)`);
});

test("shake scatters and settles; floatIn runs a seed layout into place; stop stops", () => {
  const { physics, positionOf, run } = setUp("floating", false);
  assert.ok(physics.floatIn());
  run();
  assert.equal(physics.active, false);

  assert.ok(physics.shake(positionOf, { heat: 0.8, scatter: 100 }));
  const first = physics.step();
  assert.ok(first.moving && first.moved.length === physics.simulation.count);
  run();
  assert.equal(physics.active, false);

  physics.shake(positionOf);
  physics.stop();
  assert.equal(physics.active, false);
  assert.deepEqual(physics.step(), { moving: false, moved: [] });
});

test("without a simulation, floating and shaking do nothing", () => {
  const physics = new LivePhysics({
    direction: "TB",
    physicsMode: "floating",
    linkForce: 0.5,
    centerForce: 0.2,
  });
  assert.equal(physics.floatIn(), false);
  assert.equal(
    physics.shake(() => ({ x: 0, y: 0 })),
    false,
  );
  physics.drag("a", { x: 1, y: 1 });
  physics.release("a");
  assert.equal(physics.active, false);
});

test("a drag stays in the mode it started in, even if the setting changes before it ends", () => {
  const { physics, settings, positions, positionOf, run, graphOnScreen } =
    setUp("floating");
  physics.grab("a", graphOnScreen);
  settings.physicsMode = "elastic"; // changed mid-drag
  const p = positionOf("a");
  positions.set("a", { x: p.x + 50, y: p.y });
  physics.drag("a", { x: p.x + 50, y: p.y });
  physics.release("a");
  run();
  assert.equal(physics.active, false, "the simulation cooled and stopped");
  const i = physics.simulation.indexById.get("a");
  assert.ok(Number.isNaN(physics.simulation.fx[i]), "the node was let go");
});

test("stop lets go of a held node; a new simulation stops the old run; release without a grab does nothing", () => {
  const { physics, graphOnScreen } = setUp("floating");
  physics.grab("a", graphOnScreen);
  const simulation = physics.simulation;
  physics.stop();
  const i = simulation.indexById.get("a");
  assert.ok(Number.isNaN(simulation.fx[i]));
  assert.equal(simulation.alphaTarget, 0);

  physics.grab("a", graphOnScreen);
  physics.simulation = null; // the graph was replaced mid-drag
  assert.equal(physics.active, false);
  assert.deepEqual(physics.step(), { moving: false, moved: [] });
  assert.ok(Number.isNaN(simulation.fx[i]), "the old simulation let go too");

  physics.release("nobody");
  physics.drag("nobody", { x: 0, y: 0 });
  assert.equal(physics.active, false);
});

test("elastic: nodes without a position sit the drag out instead of breaking it", () => {
  const { physics, positionOf, run } = setUp("elastic");
  const partial = (id) => (id === "e" ? undefined : positionOf(id));
  physics.grab("a", { ids: IDS, links: LINKS, positionOf: partial });
  assert.ok(physics.active);
  physics.drag("a", { x: positionOf("a").x + 80, y: positionOf("a").y });
  physics.release("a");
  run();
  assert.equal(physics.active, false);
  // Grabbing a node with no position does nothing.
  physics.grab("e", { ids: IDS, links: LINKS, positionOf: partial });
  assert.equal(physics.active, false);
});

test("floating in always ends, after floatInTicks at most", () => {
  const { physics, run } = setUp("floating", false);
  physics.tuning = { floatInTicks: 50, stillness: 0 }; // stillness 0: it would never go still on its own
  assert.ok(physics.floatIn());
  const frames = run(1000);
  assert.equal(physics.active, false);
  assert.ok(frames <= 50, `${frames} frames`);
});
