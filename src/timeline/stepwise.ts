/** A value over the seconds of a wave: `initial` from second 0, then each change from its second. */
export interface Stepwise<T> {
  initial: T;
  /** By ascending `from`, every `from` above 0. */
  changes: StepChange<T>[];
}

export interface StepChange<T> {
  from: number;
  value: T;
}

export function valueAt<T>({ initial, changes }: Stepwise<T>, t: number): T {
  let value = initial;
  for (const change of changes) {
    if (change.from > t) break;
    value = change.value;
  }
  return value;
}
