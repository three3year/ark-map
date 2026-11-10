// The 基準時間軸 of one wave and its 敵人個體.
import type { EnemyRef, IndexedDevice, Route } from "../level/index.ts";
import type { IndividualId } from "./identity.ts";
import type { Trajectory } from "./movement.ts";

/** One 敵人個體: who it is plus its {@link Trajectory}, whose 路徑 is drawn when it is selected. */
export interface Individual extends IndividualId, Trajectory {
  /** {@link individualKey}: stable within a timeline. */
  id: string;
  enemy: EnemyRef;
  route: Route;
  spawnTime: number;
  /** 無害敵人: counts as killed, never a threat. */
  harmless: boolean;
}

export interface Timeline {
  individuals: Individual[];
  devicesAt(t: number): IndexedDevice[];
  removedAt(t: number): IndexedDevice[];
}
