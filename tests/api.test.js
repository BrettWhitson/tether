// The public API: the entry point, schemas and validation, the layout and force registries, and events.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as tether from "../src/index.js";
import {
  DEFAULT_SETTINGS,
  DEFAULT_TUNING,
  LayoutGraph,
  LivePhysics,
  SETTINGS_SCHEMA,
  TUNING_OPTIONS,
  TUNING_SCHEMA,
  createForce,
  isDirectionalLayout,
  listLayouts,
  registerForce,
  registerLayout,
  resolve,
  resolveSettings,
  resolveTuning,
  runLayout,
} from "../src/index.js";

const SETTINGS = {
  direction: "TB",
  centerForce: 0.2,
  repelForce: 8,
  linkForce: 0.5,
  linkDistance: 120,
};

function smallGraph() {
  const ids = ["root", "a", "b", "c", "d"];
  return new LayoutGraph(
    ids.map((id, i) => ({ id, w: 40, h: 40, root: i === 0 })),
    [
      ["root", "a"],
      ["root", "b"],
      ["a", "c"],
      ["b", "d"],
    ].map(([source, target]) => ({ source, target })),
  );
}

/** Collect warnings instead of printing them. */
function capture(fn) {
  const warnings = [];
  const original = console.warn;
  console.warn = (message) => warnings.push(String(message));
  try {
    return { result: fn(), warnings };
  } finally {
    console.warn = original;
  }
}

test("the entry point exports the whole API", () => {
  for (const name of [
    "LayoutGraph",
    "runLayout",
    "LivePhysics",
    "ForceSimulation",
    "ElasticNetwork",
    "registerLayout",
    "registerForce",
    "resolveSettings",
    "resolveTuning",
    "SETTINGS_SCHEMA",
    "TUNING_SCHEMA",
    "Emitter",
  ])
    assert.ok(tether[name], `${name} is exported`);
});

test("defaults come from the schemas; every tuning constant has a control", () => {
  assert.equal(DEFAULT_SETTINGS.direction, SETTINGS_SCHEMA.direction.default);
  assert.deepEqual(
    TUNING_OPTIONS.map((o) => o.key),
    Object.keys(TUNING_SCHEMA),
  );
  for (const option of TUNING_OPTIONS) {
    assert.ok(option.label && option.group && option.hint, option.key);
    if (option.type !== "boolean") {
      assert.ok(option.min <= option.default, option.key);
      assert.ok(option.default <= option.max, option.key);
    }
  }
});

test("bad values are clamped or replaced by defaults, with one warning each", () => {
  const { result, warnings } = capture(() =>
    resolveTuning({
      theta: 99,
      ticksSmall: 12.4,
      dragHeat: "hot",
      velocityDecay: 0.5,
      repelScle: 3,
    }),
  );
  assert.equal(result.theta, TUNING_SCHEMA.theta.max);
  assert.equal(result.ticksSmall, 12);
  assert.equal(result.dragHeat, DEFAULT_TUNING.dragHeat);
  assert.equal(result.velocityDecay, 0.5);
  assert.equal(result.repelScle, undefined);
  assert.equal(warnings.length, 4);
  assert.match(warnings.join("\n"), /did you mean "repelScale"/);
});

test("strict mode throws instead of warning", () => {
  assert.throws(
    () => resolveSettings({ physicsMode: "wobbly" }, { strict: true }),
    /physicsMode/,
  );
  assert.throws(
    () =>
      runLayout(
        smallGraph(),
        { ...SETTINGS, linkDistance: -5 },
        { strict: true },
      ),
    /linkDistance/,
  );
});

test("settings keep the app's own keys; enums accept registered plugins", () => {
  const { result, warnings } = capture(() =>
    resolveSettings({ myAppFlag: 1, layout: "someday-registered" }),
  );
  assert.equal(result.myAppFlag, 1);
  assert.equal(result.layout, "someday-registered");
  assert.equal(warnings.length, 0);
});

test("resolve() reports colours and enums", () => {
  const schema = {
    tint: { type: "color", default: "#fff" },
    shape: { type: "enum", values: ["a", "b"], default: "a" },
  };
  const warnings = [];
  const out = resolve(
    schema,
    { tint: "not a colour", shape: "c" },
    { warn: (m) => warnings.push(m) },
  );
  assert.deepEqual(out, { tint: "#fff", shape: "a" });
  assert.equal(warnings.length, 2);
  assert.deepEqual(
    resolve(schema, { tint: "rgba(1, 2, 3, 0.5)" }).tint,
    "rgba(1, 2, 3, 0.5)",
  );
});

test("a registered layout is used by name, and its structure mode drives the physics", () => {
  registerLayout("test-line", {
    label: "Line",
    seed(graph) {
      for (let i = 0; i < graph.count; i++) {
        graph.x[i] = i * 100;
        graph.y[i] = 0;
      }
      return { mode: "none" };
    },
  });
  assert.ok(listLayouts().some((l) => l.name === "test-line"));
  assert.equal(isDirectionalLayout({ layout: "test-line" }), false);
  assert.equal(isDirectionalLayout({ layout: "tree" }), true);
  assert.equal(
    isDirectionalLayout({ layout: "tree", direction: "radial" }),
    false,
  );
  const graph = smallGraph();
  const simulation = runLayout(graph, { ...SETTINGS, layout: "test-line" });
  assert.equal(simulation.options.mode, "none");
  // A line stays roughly a line: the forces polish it but there's no level or ring to pull it into.
  const ys = Array.from(graph.y);
  assert.ok(
    Math.max(...ys) - Math.min(...ys) <
      Math.max(...graph.x) - Math.min(...graph.x),
  );
});

test("an unknown layout falls back to the tree, with a warning", () => {
  const { result, warnings } = capture(() =>
    runLayout(smallGraph(), { ...SETTINGS, layout: "nope" }),
  );
  assert.equal(result.options.mode, "layered");
  assert.match(warnings.join(), /unknown layout "nope"/);
});

test("registerLayout and registerForce check what they're given", () => {
  assert.throws(() => registerLayout("", { seed() {} }), TypeError);
  assert.throws(() => registerLayout("x", {}), /seed/);
  assert.throws(() => registerForce("x", 3), /factory/);
});

test("extra forces: built-in position pulls the graph over; registered ones run every tick", () => {
  const plain = smallGraph();
  runLayout(plain, { ...SETTINGS, direction: "radial" });
  const pulled = smallGraph();
  runLayout(pulled, {
    ...SETTINGS,
    direction: "radial",
    forces: [{ type: "position", x: 2000, strength: 0.5 }],
  });
  const meanX = (g) => g.x.reduce((a, b) => a + b, 0) / g.count;
  assert.ok(meanX(pulled) > meanX(plain) + 50);

  let applied = 0,
    initialized = 0;
  registerForce("test-counter", () => ({
    initialize: () => initialized++,
    apply: () => applied++,
  }));
  const simulation = runLayout(smallGraph(), {
    ...SETTINGS,
    forces: [{ type: "test-counter" }],
  });
  assert.equal(initialized, 1);
  assert.ok(applied > 10);
  assert.equal(simulation.forces[0].type, "test-counter");

  const { result, warnings } = capture(() => createForce({ type: "missing" }));
  assert.equal(result, null);
  assert.match(warnings.join(), /unknown force/);
});

test("addForce() adds a force to a running simulation, and takes it out again", () => {
  const simulation = runLayout(smallGraph(), SETTINGS);
  let calls = 0;
  const remove = simulation.addForce({ apply: () => calls++ });
  simulation.tick();
  remove();
  simulation.tick();
  assert.equal(calls, 1);
  assert.throws(() => simulation.addForce({}), /apply/);
});

test("LivePhysics events: grab, start, release, settle, in order", () => {
  for (const physicsMode of ["elastic", "floating", "none"]) {
    const settings = { ...SETTINGS, physicsMode };
    const graph = smallGraph();
    const physics = new LivePhysics(settings);
    physics.simulation = runLayout(graph, settings);
    const events = [];
    for (const type of ["grab", "start", "release", "settle"])
      physics.on(type, (detail) =>
        events.push(detail ? `${type}:${detail.mode ?? detail.reason}` : type),
      );
    const positionOf = (id) => graph.positionOf(id);
    physics.grab("a", { ids: graph.ids, links: [], positionOf });
    physics.drag("a", { x: 500, y: 500 });
    physics.release("a");
    for (let n = 0; physics.active && n < 5000; n++) physics.step();
    assert.equal(physics.active, false, physicsMode);
    assert.equal(events[0], `grab:${physicsMode}`, physicsMode);
    assert.ok(events.includes("start:drag"), physicsMode);
    assert.ok(events.includes(`release:${physicsMode}`), physicsMode);
    assert.equal(events.at(-1), "settle", physicsMode);
  }
});

test("physics mode none: only the dragged node moves", () => {
  const settings = { ...SETTINGS, physicsMode: "none" };
  const graph = smallGraph();
  const physics = new LivePhysics(settings);
  physics.simulation = runLayout(graph, settings);
  physics.grab("a", {
    ids: graph.ids,
    links: [],
    positionOf: (id) => graph.positionOf(id),
  });
  physics.drag("a", { x: 7, y: 9 });
  assert.deepEqual(physics.step().moved, [["a", 7, 9]]);
  assert.equal(physics.active, false);
});

test("emitter: on() returns an unsubscribe; once() fires once; a throwing listener doesn't stop the rest", () => {
  const emitter = new tether.Emitter();
  const seen = [];
  const off = emitter.on("x", (v) => seen.push(`a${v}`));
  emitter.once("x", (v) => seen.push(`b${v}`));
  const errors = [];
  const original = console.error;
  console.error = (...args) => errors.push(args);
  emitter.on("x", () => {
    throw new Error("boom");
  });
  try {
    emitter.emit("x", 1);
    off();
    emitter.emit("x", 2);
  } finally {
    console.error = original;
  }
  assert.deepEqual(seen, ["a1", "b1"]);
  assert.equal(errors.length, 2);
});
