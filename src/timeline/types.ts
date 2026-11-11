// The 基準時間軸 of one wave and its 敵人個體.
import type { EnemyRef, IndexedDevice, Route } from "../level/index.ts";
import type { IndividualId } from "./identity.ts";
import type { Trajectory } from "./movement.ts";
import type { DeviceSwitchMark, SwitchMark } from "./switchMarks.ts";

/** One 敵人個體: who it is plus its {@link Trajectory}, whose 路徑 is drawn when it is selected. */
export interface Individual extends IndividualId, Trajectory {
  /** {@link individualKey}: stable within a timeline. */
  id: string;
  enemy: EnemyRef;
  route: Route;
  spawnTime: number;
  /** 無害敵人: counts as killed, never a threat. */
  harmless: boolean;
  /** 開關標記 of the action that spawns it, one per 開關 it belongs to. */
  marks: SwitchMark[];
}

/** A device the 基準時間軸 lists at some second, on the field or removed. */
export interface TimelineDevice extends IndexedDevice {
  /** 開關標記 of every 開關 acting on it: the same whatever the second, 開關狀態 or 移除. */
  marks: DeviceSwitchMark[];
}

export interface Timeline {
  individuals: Individual[];
  devicesAt(t: number): TimelineDevice[];
  removedAt(t: number): TimelineDevice[];
  /** Every device listed at some second of the wave, on the field or removed. */
  listedDevices: TimelineDevice[];
}
