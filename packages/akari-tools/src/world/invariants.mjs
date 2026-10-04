const EPSILON = 1e-9;
const EDGE_TYPES = new Set(["move", "portal", "cut"]);
const TRANSITIONS = new Set(["none", "dive", "mist", "occluder", "fade", "push"]);
const COLOR = /^#[0-9a-fA-F]{6}$/;

export function checkWorldMap(map, options = { strict: false }) {
  const errors = [];
  const warnings = [];
  const error = (code, message) => errors.push({ code, message });
  const warning = (code, message) => warnings.push({ code, message });
  const worlds = array(map?.worlds, "worlds", "C1", error);
  const zones = array(map?.zones, "zones", "C2", error);
  const stops = array(map?.cameraStops, "cameraStops", "C2", error);
  const edges = array(map?.edges, "edges", "C3", error);
  const retained = array(map?.retainedNodes, "retainedNodes", "C5", error);

  if (worlds.length < 1) error("C1", "worlds must have at least 1 entry");
  const worldIds = new Set();
  for (const world of worlds) {
    if (worldIds.has(world?.id)) error("C1", `world id is duplicated: ${world?.id}`);
    worldIds.add(world?.id);
  }
  for (const world of worlds) {
    const count = zones.filter((zone) => zone?.world === world?.id).length;
    if (count < 2) error("C1", `world ${world?.id} must be referenced by at least 2 zones`);
  }
  for (const zone of zones) if (!worldIds.has(zone?.world)) error("C1", `zone ${zone?.id} references an undefined world`);

  const zoneIds = ids(zones, "zone", "C2", error);
  const stopIds = ids(stops, "cameraStop", "C2", error);
  if (!sameSet(zoneIds, stopIds)) error("C2", "The id sets of zones and cameraStops do not match");
  for (const stop of stops) if (!worldIds.has(stop?.world)) error("C2", `cameraStop ${stop?.id} references an undefined world`);
  for (let index = 0; index < stops.length; index += 1) {
    const stop = stops[index];
    if (!finite(stop?.at) || !finite(stop?.leave) || !(stop.at < stop.leave)) error("C2", `cameraStop ${stop?.id} must be finite numbers satisfying at < leave`);
    if (index > 0) {
      const previous = stops[index - 1];
      if (!(previous.at <= stop.at)) error("C2", "cameraStops must be ascending by at");
      if (!(previous.leave <= stop.at)) error("C2", `The windows of cameraStop ${previous.id} and ${stop.id} overlap`);
    }
  }

  if (edges.length !== Math.max(0, stops.length - 1)) error("C3", "The number of edges must be cameraStops - 1");
  const stopById = new Map(stops.map((stop) => [stop?.id, stop]));
  edges.forEach((edge, index) => {
    const from = stopById.get(edge?.from);
    const to = stopById.get(edge?.to);
    if (!from || !to) error("C3", `from / to of edge ${edge?.id} does not reference a stop`);
    const expectedFrom = stops[index];
    const expectedTo = stops[index + 1];
    if (!expectedFrom || !expectedTo || edge?.from !== expectedFrom.id || edge?.to !== expectedTo.id || !near(edge?.t0, expectedFrom.leave) || !near(edge?.t1, expectedTo.at)) {
      error("C3", `edge ${edge?.id} does not match the order or timing of cameraStops`);
    }

    if (!EDGE_TYPES.has(edge?.type)) error("C4", `type of edge ${edge?.id} is undefined`);
    if (edge?.type !== "move") {
      if (typeof edge?.via !== "string" || edge.via.length === 0) error("C4", `edge ${edge?.id} has no via`);
      if (!edge?.transition || typeof edge.transition !== "object") error("C4", `edge ${edge?.id} has no transition`);
      if (!finite(edge?.switchTime) || !(edge.t0 < edge.switchTime && edge.switchTime < edge.t1)) error("C4", `switchTime of edge ${edge?.id} must be between t0 and t1`);
    }

    if (from && to && from.world !== to.world) {
      if (!Array.isArray(edge?.carry) || edge.carry.length === 0) error("C5", `edge ${edge?.id} crosses worlds and needs carry`);
      else for (const item of edge.carry) if (!retained.includes(item)) error("C5", `carry of edge ${edge?.id} must be a subset of retainedNodes: ${item}`);
    }

    const transitionKind = edge?.transition?.kind;
    if (!TRANSITIONS.has(transitionKind)) error("C6", `transition.kind of edge ${edge?.id} is undefined`);
    if (map?.kind === "spatial" && transitionKind === "push") error("C6", `push cannot be used on spatial edge ${edge?.id}`);

    if (edge?.type === "cut") {
      const cover = edge?.transition?.cover;
      if (cover === null) {
        const report = { code: "C7", message: `cover of cut edge ${edge?.id} is not measured` };
        (options?.strict ? errors : warnings).push(report);
      } else if (!finite(cover) || cover < 0 || cover > 0.4) {
        error("C7", `cover of cut edge ${edge?.id} must be a finite number from 0 to 0.4`);
      }
    }

    // C8: portal の cover には時間閾値を課さない。
    if (from && to && from.world === to.world && edge?.type !== "move") error("C10", `edge ${edge?.id} within the same world must be move`);
  });

  for (const world of worlds) {
    if (world?.palette) for (const [key, value] of Object.entries(world.palette)) if (!COLOR.test(value)) error("C9", `palette.${key} of world ${world.id} must be a 6-digit hex value`);
    if (map?.kind === "flat") {
      const bounds = world?.flat?.bounds;
      if (!Array.isArray(bounds) || bounds.length !== 4 || !bounds.every(finite) || !(bounds[2] > 0) || !(bounds[3] > 0)) error("C9", `flat.bounds of world ${world?.id} must be finite [x,y,w,h] with positive w and h`);
    } else if (world?.spatial?.floor) {
      const size = world.spatial.floor.size;
      if (!Array.isArray(size) || size.length !== 2 || !size.every(finite) || !size.every((value) => value > 0)) error("C9", `floor.size of world ${world?.id} must be 2 finite positive numbers`);
    }
  }

  if (worlds.length >= 2 && !edges.some((edge) => edge?.type === "portal")) warning("R1", "When there are 2 or more worlds, at least 1 portal is recommended");
  return { errors, warnings };
}

function array(value, label, code, error) {
  if (Array.isArray(value)) return value;
  error(code, `${label} must be an array`);
  return [];
}

function ids(values, label, code, error) {
  const result = new Set();
  for (const value of values) {
    if (result.has(value?.id)) error(code, `${label} id is duplicated: ${value?.id}`);
    result.add(value?.id);
  }
  return result;
}

const finite = (value) => typeof value === "number" && Number.isFinite(value);
const near = (a, b) => finite(a) && finite(b) && Math.abs(a - b) <= EPSILON;
const sameSet = (a, b) => a.size === b.size && [...a].every((value) => b.has(value));
