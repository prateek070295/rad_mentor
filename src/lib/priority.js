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

// ---- Chapter-first ranking (uses ONLY the CHAPTER's category + order) ----
const CHAPTER_CATEGORY_RANK = { must: 3, good: 2, nice: 1 };

// Get "root" chapter id from topicId like "1.3.2" -> "1"
export function getChapterId(item) {
  return String(item?.itemId || "").split(".")[0];
}
/**
 * Build a comparator that ranks items by:
 * 1) chapter category (must > good > nice)
 * 2) chapter order (smaller comes earlier)
 * 3) smaller estimatedMinutes (packs nicer)
 * 4) fallback to previous priority score
 */
export function makeChapterComparator(chapterMeta) {
  return (a, b) => {
    const ca = chapterMeta[getChapterId(a)] || {};
    const cb = chapterMeta[getChapterId(b)] || {};

    const ra = CHAPTER_CATEGORY_RANK[ca.categoryNorm] ?? 0;
    const rb = CHAPTER_CATEGORY_RANK[cb.categoryNorm] ?? 0;
    if (ra !== rb) return rb - ra; // must > good > nice

    const oa = Number(ca.order ?? 9999);
    const ob = Number(cb.order ?? 9999);
    if (oa !== ob) return oa - ob; // earlier chapter first

    // Tie-breakers for packing/day feel
    const ma = Number(a.estimatedMinutes) || 0;
    const mb = Number(b.estimatedMinutes) || 0;
    if (ma !== mb) return ma - mb;

    // Final fallback to old scorer (harmless)
    return byPriorityDesc(a, b);
  };
}