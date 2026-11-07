// The 基準時間軸 of one wave and its 敵人個體.
import type { EnemyRef, Route } from "../level/index.ts";
import type { IndividualId } from "./identity.ts";
import type { IndividualState, PathLeg } from "./movement.ts";

export interface Individual extends IndividualId {
  /** {@link individualKey}: stable within a timeline. */
  id: string;
  enemy: EnemyRef;
  route: Route;
  spawnTime: number;
  /** 無害敵人: counts as killed, never a threat. */
  harmless: boolean;
  leakTime: number | null;
  /** 路徑 left at second `t`, drawn when the individual is selected; empty when off the map. */
  remainingPathAt(t: number): PathLeg[];
  stateAt(t: number): IndividualState;
}

export interface Timeline {
  individuals: Individual[];
}
