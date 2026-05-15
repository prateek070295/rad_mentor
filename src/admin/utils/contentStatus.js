export const STRUCTURED_DRAFTS_STORAGE_KEY = 'admin_structured_drafts';

export const getNodeTopicKey = (node = {}) => node.topicId || node.id;

export const getStructuredContentPath = (organId, topicId) =>
  organId && topicId
    ? `sections/${organId}/nodes/${topicId}/contentSections`
    : null;

export const getStudyItemPath = (organId, topicId) =>
  organId && topicId ? `study_items/${organId}__${topicId}` : null;

export const deltaToText = (delta) => {
  if (!Array.isArray(delta?.ops)) return '';
  return delta.ops
    .map((op) => {
      if (typeof op.insert === 'string') return op.insert;
      if (op.insert?.image) return `[Image:${op.insert.image}]`;
      return '';
    })
    .join('')
    .trim();
};

export const hasLegacyContent = (node = {}) =>
  Boolean(deltaToText(node.mainContent));

export const hasPublishedStructuredContent = (node = {}) =>
  node.hasStructuredContent === true || Number(node.contentSectionsCount ?? 0) > 0;

export const getDiscoveredStructuredCount = (node = {}, discoveredCounts = {}) => {
  const byDocId = discoveredCounts[node.id];
  if (Number.isFinite(Number(byDocId))) return Number(byDocId);
  if (Number.isFinite(Number(byDocId?.structuredCount))) return Number(byDocId.structuredCount);

  const topicKey = getNodeTopicKey(node);
  const byTopicId = discoveredCounts[topicKey];
  if (Number.isFinite(Number(byTopicId))) return Number(byTopicId);
  if (Number.isFinite(Number(byTopicId?.structuredCount))) return Number(byTopicId.structuredCount);

  return 0;
};

export const hasStructuredContent = (node = {}, discoveredCounts = {}) =>
  hasPublishedStructuredContent(node) || getDiscoveredStructuredCount(node, discoveredCounts) > 0;

export const hasDiscoveredLegacyContent = (node = {}, discoveredCounts = {}) => {
  const byDocId = discoveredCounts[node.id];
  if (byDocId?.legacy === true) return true;

  const topicKey = getNodeTopicKey(node);
  const byTopicId = discoveredCounts[topicKey];
  return byTopicId?.legacy === true;
};

const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);

export const adaptStudyItemContent = (studyItem = {}) => {
  const structuredCandidates = [
    studyItem.structuredContent,
    studyItem.structured,
    studyItem.content,
    studyItem.lesson,
    studyItem.topic,
    studyItem,
  ].filter(isObject);

  const structuredContent = structuredCandidates.find(
    (candidate) =>
      Array.isArray(candidate.sections) ||
      Array.isArray(candidate.objectives) ||
      Array.isArray(candidate.key_points),
  );

  const adaptedStructured = Array.isArray(structuredContent?.sections)
    ? {
        objectives: Array.isArray(structuredContent.objectives) ? structuredContent.objectives : [],
        sections: structuredContent.sections,
        key_points: Array.isArray(structuredContent.key_points) ? structuredContent.key_points : [],
      }
    : null;

  const legacyTextCandidates = [
    deltaToText(studyItem.mainContent),
    typeof studyItem.legacyText === 'string' ? studyItem.legacyText.trim() : '',
    typeof studyItem.rawText === 'string' ? studyItem.rawText.trim() : '',
    typeof studyItem.markdown === 'string' ? studyItem.markdown.trim() : '',
    typeof studyItem.text === 'string' ? studyItem.text.trim() : '',
    typeof studyItem.body === 'string' ? studyItem.body.trim() : '',
    typeof studyItem.content === 'string' ? studyItem.content.trim() : '',
  ].filter(Boolean);

  return {
    structuredContent: adaptedStructured,
    legacyText: legacyTextCandidates[0] || '',
    schemaType: adaptedStructured
      ? 'structured'
      : legacyTextCandidates.length
        ? 'legacy'
        : 'metadata-only',
  };
};

export const hasLocalStructuredDraft = (topicId) => {
  if (!topicId || typeof window === 'undefined') return false;
  try {
    const raw = window.localStorage.getItem(STRUCTURED_DRAFTS_STORAGE_KEY);
    if (!raw) return false;
    const drafts = JSON.parse(raw);
    return Boolean(drafts?.[topicId]?.structuredContent);
  } catch (_) {
    return false;
  }
};

export const computeStatusMap = (nodes, childrenByTopicId, discoveredCounts = {}) => {
  const statusMemo = {};
  const byTopicId = new Map(nodes.map((node) => [getNodeTopicKey(node), node]));

  const determineStatus = (topicId) => {
    if (statusMemo[topicId]) return statusMemo[topicId];

    const node = byTopicId.get(topicId);
    if (!node) {
      statusMemo[topicId] = 'grey';
      return statusMemo[topicId];
    }

    const children = childrenByTopicId.get(topicId) || [];
    const hasStructured = hasStructuredContent(node, discoveredCounts);

    if (hasStructured) {
      statusMemo[topicId] = 'green';
      return statusMemo[topicId];
    }

    if (children.length === 0) {
      statusMemo[topicId] =
        hasLegacyContent(node) || hasDiscoveredLegacyContent(node, discoveredCounts)
          ? 'yellow'
          : 'grey';
      return statusMemo[topicId];
    }

    const childStatuses = children.map((child) => determineStatus(getNodeTopicKey(child)));
    const anyGreen = childStatuses.some((status) => status === 'green');
    const anyYellow = childStatuses.some((status) => status === 'yellow');

    if (anyGreen || anyYellow) {
      statusMemo[topicId] = 'yellow';
    } else {
      statusMemo[topicId] = 'grey';
    }
    return statusMemo[topicId];
  };

  nodes.forEach((node) => {
    determineStatus(getNodeTopicKey(node));
  });

  return statusMemo;
};
