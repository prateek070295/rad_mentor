import { generateFrontSortKey } from "../sortKeyUtils";

describe("generateFrontSortKey", () => {
  it("produces a negative key using timestamp and random jitter", () => {
    const key = generateFrontSortKey(() => 1234567890, () => 0.789);
    expect(key).toBe(-1234567890789);
  });

  it("places newer keys ahead of older ones when sorted ascending", () => {
    const older = generateFrontSortKey(() => 1000, () => 0.1);
    const newer = generateFrontSortKey(() => 1001, () => 0.1);
    expect(newer).toBeLessThan(older);
  });

  it("uses the random provider to avoid collisions within a millisecond", () => {
    const randomValues = [0.001, 0.999];
    const randomProvider = () => randomValues.shift() ?? 0;
    const first = generateFrontSortKey(() => 7777, randomProvider);
    const second = generateFrontSortKey(() => 7777, randomProvider);
    expect(second).not.toEqual(first);
  });

  it("sanitizes provider output before constructing the key", () => {
    const key = generateFrontSortKey(() => "1002.9", () => 27.987);
    const magnitude = Math.abs(key);
    expect(Math.floor(magnitude / 1000)).toBe(1002);
    expect(magnitude % 1000).toBeLessThan(1000);
  });
});
