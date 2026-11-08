// 出生點 and 消失點 of one wave's timeline: the cells its individuals come out of and leave at.
// Pure; no DOM or network.
import { cellKey, type Cell } from "../level/index.ts";
import { actionKey, sameAction, type WaveActionId } from "./identity.ts";
import type { Individual, Timeline } from "./types.ts";

/** 出生點 ("spawn") or 消失點 ("exit"). */
export type EndpointKind = "spawn" | "exit";

/** Where an endpoint sits: one kind on one cell. */
export interface EndpointPlace {
  kind: EndpointKind;
  cell: Cell;
}

/** A cell that is the 出生點 or the 消失點 of at least one individual of the timeline. */
export interface RouteEndpoint extends EndpointPlace {
  /** The spawn actions whose individuals come out here (spawn) or leave here (exit), each once. */
  actions: WaveActionId[];
}

/** "spawn@row,col" / "exit@row,col": unique within one timeline's endpoints. */
export function endpointKey({ kind, cell }: EndpointPlace): string {
  return `${kind}@${cellKey(cell)}`;
}

/**
 * The endpoints of one individual: its route start is a 出生點; its route end is a 消失點 only if
 * it leaves (a patrol never does). Passing through a 通道 and checkpoints on the way count for
 * neither.
 */
function endpointsOf(individual: Individual): EndpointPlace[] {
  const spawn: EndpointPlace = { kind: "spawn", cell: individual.route.start };
  if (individual.leakTime === null) return [spawn];
  return [spawn, { kind: "exit", cell: individual.route.end }];
}

/**
 * Every endpoint of the timeline's individuals, by the rule of {@link endpointsOf}. Ordered spawns
 * first, then by row, then by column.
 */
export function routeEndpoints(timeline: Timeline): RouteEndpoint[] {
  const byKey = new Map<string, { endpoint: RouteEndpoint; actions: Set<string> }>();
  const add = ({ kind, cell }: EndpointPlace, action: WaveActionId) => {
    const key = endpointKey({ kind, cell });
    let entry = byKey.get(key);
    if (!entry) {
      entry = { endpoint: { kind, cell, actions: [] }, actions: new Set() };
      byKey.set(key, entry);
    }
    const id = actionKey(action);
    if (entry.actions.has(id)) return;
    entry.actions.add(id);
    const { branchIndex, fragmentIndex, actionIndex } = action;
    entry.endpoint.actions.push({ branchIndex, fragmentIndex, actionIndex });
  };
  for (const individual of timeline.individuals) {
    for (const place of endpointsOf(individual)) add(place, individual);
  }
  const kindOrder: Record<EndpointKind, number> = { spawn: 0, exit: 1 };
  return [...byKey.values()]
    .map((e) => e.endpoint)
    .sort(
      (a, b) =>
        kindOrder[a.kind] - kindOrder[b.kind] || a.cell.row - b.cell.row || a.cell.col - b.cell.col,
    );
}

/**
 * The 端點篩選 on the map: whether `individual` comes out of (spawn) or leaves at (exit)
 * `endpoint`, by the rule of {@link endpointsOf}. The individuals it matches are exactly those of
 * the rows {@link endpointRows} lists.
 */
export function matchesEndpoint(individual: Individual, endpoint: EndpointPlace): boolean {
  const key = endpointKey(endpoint);
  return endpointsOf(individual).some((place) => endpointKey(place) === key);
}

/**
 * The 端點篩選: the rows of wave `waveIndex` with an individual coming out of (spawn) or leaving
 * at (exit) `endpoint`, an endpoint of that wave's timeline. A candidate that is not picked
 * spawns nothing, so it is never listed.
 */
export function endpointRows<Row extends WaveActionId & { waveIndex: number }>(
  rows: Row[],
  waveIndex: number,
  endpoint: RouteEndpoint,
): Row[] {
  return rows.filter(
    (row) => row.waveIndex === waveIndex && endpoint.actions.some((a) => sameAction(a, row)),
  );
}
