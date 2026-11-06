import { describe, expect, it } from "vitest";
import { loadMapView, saveMapView } from "./mapViewPreference.ts";

function memoryStorage(): Pick<Storage, "getItem" | "setItem"> {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
  };
}

const brokenStorage: Pick<Storage, "getItem" | "setItem"> = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
};

describe("map view preference", () => {
  it("defaults to the tilted view", () => {
    expect(loadMapView(memoryStorage())).toBe("tilted");
    expect(loadMapView(null)).toBe("tilted");
  });

  it("remembers the flat view across page loads", () => {
    const storage = memoryStorage();
    saveMapView(storage, "flat");
    expect(loadMapView(storage)).toBe("flat");
    saveMapView(storage, "tilted");
    expect(loadMapView(storage)).toBe("tilted");
  });

  it("falls back to tilted when storage is blocked or holds junk", () => {
    expect(() => saveMapView(brokenStorage, "flat")).not.toThrow();
    expect(loadMapView(brokenStorage)).toBe("tilted");
    const storage = memoryStorage();
    storage.setItem("ak-snapshot:map-view", "sideways");
    expect(loadMapView(storage)).toBe("tilted");
  });
});
