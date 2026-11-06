// The map view (tilted or flat) is a per-browser preference, kept out of the URL so a
// shared link shows the recipient's own choice.

export type MapViewMode = "tilted" | "flat";

type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;

const key = "ak-snapshot:map-view";

/** `localStorage`, or null where the browser blocks it (private mode, sandboxed previews). */
export function browserStorage(): PreferenceStorage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

export function loadMapView(storage: PreferenceStorage | null): MapViewMode {
  try {
    return storage?.getItem(key) === "flat" ? "flat" : "tilted";
  } catch {
    return "tilted";
  }
}

export function saveMapView(storage: PreferenceStorage | null, mode: MapViewMode): void {
  try {
    storage?.setItem(key, mode);
  } catch {
    // The choice still applies for this page; it just won't be remembered.
  }
}
