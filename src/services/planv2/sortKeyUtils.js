// src/services/planv2/sortKeyUtils.js

/**
 * Generates a negative sortKey that sorts newly unscheduled topics to the front
 * of the queue. The millisecond timestamp ensures monotonicity, while the
 * random component avoids collisions when multiple updates land within the same
 * millisecond.
 *
 * @param {() => number} nowProvider optional provider used mainly for testing
 * @param {() => number} randomProvider optional provider used mainly for testing
 * @returns {number} negative integer suitable for Firestore ordering (asc)
 */
export function generateFrontSortKey(
  nowProvider = () => Date.now(),
  randomProvider = () => Math.random(),
) {
  const nowValue = Number(nowProvider());
  const safeNow = Number.isFinite(nowValue) ? Math.floor(nowValue) : 0;

  const randomValue = Number(randomProvider());
  const normalizedRandom = Number.isFinite(randomValue)
    ? Math.abs(randomValue % 1)
    : 0;
  const randomComponent = Math.floor(normalizedRandom * 1000);

  return -1 * (safeNow * 1000 + randomComponent);
}

