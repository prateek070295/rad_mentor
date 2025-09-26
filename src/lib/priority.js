// src/lib/priority.js
// Read-only scoring to rank items from /study_items for previews/tests.
// No writes to Firestore. We can tune weights later.

const CATEGORY_SCORE = { must: 3, good: 2, nice: 1 };
const LEVEL_BONUS = { chapter: 0, topic: 0.5, subtopic: 1.0 }; // slight bias to smaller chunks

// Clamp minutes so huge items don’t dominate; small reward for “chunky” topics.
function minutesBonus(estimatedMinutes = 45) {
  const m = Math.max(10, Math.min(Number(estimatedMinutes) || 0, 120)); // 10..120
  return (m - 10) / 110; // 0..1
}

// Higher score = higher priority
export function computePriority(item) {
  const cat = CATEGORY_SCORE[item?.categoryNorm] ?? 2; // default "good"
  const foundational = item?.foundational ? 1 : 0;     // +1 if foundational
  const levelB = LEVEL_BONUS[item?.level] ?? 0;
  const mB = minutesBonus(item?.estimatedMinutes);

  // Weighted sum: category dominates; foundational next; level/minutes fine-tune.
  return cat * 10 + foundational * 3 + levelB * 1.5 + mB;
}

// Sort helper (desc)
export function byPriorityDesc(a, b) {
  return computePriority(b) - computePriority(a);
}
