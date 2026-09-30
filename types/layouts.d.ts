export type SeedContext = {
  tuning: typeof import("./tuning.js").PHYSICS_TUNING;
  /**
   * 0..1: how much of each label's overhang to leave room for
   */
  labelShare: number;
  /**
   * space between siblings (from Repel)
   */
  siblingGap: number;
  /**
   * space between levels (link distance minus the node size)
   */
  levelGap: number;
  /**
   * node i's footprint with its share of label
   */
  sizeOf: (i: number) => {
    w: number;
    h: number;
  };
};
export type SeedResult =
  | {
      mode: "layered";
      axis: "x" | "y";
    }
  | {
      mode: "radial";
      depthById: Map<string, number>;
      rootId: string;
    }
  | {
      mode: "none";
    };
export type LayoutDefinition = {
  /**
   * for settings UIs
   */
  label?: string;
  /**
   * levels along one axis (labels beside nodes in horizontal flows, right-angle
   * edges): true for "tree"; false for radial and free layouts (default false)
   */
  directional?: boolean;
  seed: (
    graph: import("./layout-graph.js").LayoutGraph,
    settings: import("./settings.js").LayoutSettings,
    context: SeedContext,
  ) => SeedResult | null;
};
/**
 * Add a layout (or replace one, built-ins included).
 * @param {string} name
 * @param {LayoutDefinition} definition
 */
export declare function registerLayout(
  name: string,
  definition: LayoutDefinition,
): void;
/** @returns {LayoutDefinition | undefined} */
export declare function getLayout(name: any): LayoutDefinition | undefined;
/** The registered layouts: [{ name, label, directional }]. */
export declare function listLayouts(): {
  name: string;
  label: string;
  directional: boolean;
}[];
/** The layout the settings ask for: `layout`, with `direction: "radial"` as shorthand for the radial layout. */
export declare function layoutNameOf(settings: any): any;
/** Does this layout spread levels along an axis (the direction)? Unknown layouts count as the tree they fall back to. */
export declare function isDirectionalLayout(settings: any): boolean;
