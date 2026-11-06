// Identity of an action and of an 敵人個體 within one wave's timeline.

/**
 * An action of one wave's timeline: in a fragment of the wave, or (`branchIndex` set) in a phase
 * of a 條件出兵 switched on in it, `fragmentIndex` being the phase.
 */
export interface WaveActionId {
  branchIndex: number | null;
  fragmentIndex: number;
  actionIndex: number;
}

/** 敵人個體 identity within one wave's timeline: the (spawnIndex + 1)-th of its action. */
export interface IndividualId extends WaveActionId {
  spawnIndex: number;
}

/** "<fragment>-<action>", with a "b<branch>-" prefix for a 條件出兵. */
export function actionKey({ branchIndex, fragmentIndex, actionIndex }: WaveActionId): string {
  return `${branchIndex === null ? "" : `b${branchIndex}-`}${fragmentIndex}-${actionIndex}`;
}

/** "<action key>-<k>": unique within one wave's timeline. */
export function individualKey(id: IndividualId): string {
  return `${actionKey(id)}-${id.spawnIndex}`;
}

export function sameAction(a: WaveActionId, b: WaveActionId): boolean {
  return actionKey(a) === actionKey(b);
}
