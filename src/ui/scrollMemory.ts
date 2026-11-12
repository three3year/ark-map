/*
 * 上一頁 and 下一頁 bring a page back to where it was scrolled. The app restores it once the page
 * has rendered: a browser restoring it on its own may do so while the page being left is still on
 * screen, cut short by that page's height.
 */
history.scrollRestoration = "manual";

const positions = new Map<string, number>();
let entryCount = 0;

/** The current history entry's key, given to it on first sight. */
function entryKey(): string {
  const key: unknown = history.state?.scrollKey;
  if (typeof key === "string") return key;
  const fresh = `${Date.now()}-${entryCount++}`;
  history.replaceState({ ...history.state, scrollKey: fresh }, "");
  return fresh;
}

/** Note where the current history entry is scrolled; call on every scroll. */
export function recordScroll() {
  positions.set(entryKey(), scrollY);
}

/** Where the current history entry was last scrolled; undefined for one not seen before. */
export function savedScroll(): number | undefined {
  return positions.get(entryKey());
}
