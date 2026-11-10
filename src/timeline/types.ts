// The 基準時間軸 of one wave: its 敵人個體 and the 裝置 on the field.
import type { Device, EnemyRef, Route } from "../level/index.ts";
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
  /** The 裝置 on the field at second `t` of the wave, in level-file order. */
  devicesAt(t: number): Device[];
  /**
   * The 裝置 off the field at second `t` only because the user removed them (移除), in level-file
   * order: on the field otherwise.
   */
  removedAt(t: number): Device[];
}
