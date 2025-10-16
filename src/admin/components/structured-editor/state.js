// file: src/admin/components/structured-editor/state.js
/**
 * Centralized reducer + helpers for the structured content editor.
 * The goal is to provide predictable mutations for sections and their nested resources
 * while maintaining schema compliance (order fields, required arrays, defaults, etc.).
 */

const clamp = (value, min, max) => {
  if (Number.isNaN(value)) return min;
  return Math.max(min, Math.min(value, max));
};

export const BLOOM_LEVELS = ['remember', 'understand', 'apply', 'analyze', 'evaluate'];
export const DEFAULT_BLOOM_LEVEL = 'understand';

let localIdSeed = 0;
const makeLocalId = (prefix) => `${prefix || 'item'}-${Date.now().toString(36)}-${(localIdSeed += 1)}`;

const ensureArray = (value) => (Array.isArray(value) ? value.slice() : []);

const sanitizeBloomLevel = (value) =>
  BLOOM_LEVELS.includes(value) ? value : DEFAULT_BLOOM_LEVEL;

export const createEmptyImage = () => ({
  localId: makeLocalId('image'),
  alt: '',
  url: '',
  source: '',
  figure_id: '',
});

export const createEmptyCase = () => ({
  localId: makeLocalId('case'),
  label: '',
  url: '',
});

export const createEmptyMisconception = () => ({
  localId: makeLocalId('misconception'),
  claim: '',
  correction: '',
});

export const createEmptyCheckpoint = (type = 'mcq') => {
  const base = {
    localId: makeLocalId('checkpoint'),
    type,
    question_md: '',
    rationale_md: '',
    hints: [''],
    bloom_level: DEFAULT_BLOOM_LEVEL,
    figure_id: '',
  };

  if (type === 'mcq') {
    return {
      ...base,
      options: ['', '', '', ''],
      correct_index: 0,
      answer_patterns: [],
    };
  }

  return {
    ...base,
    answer_patterns: [''],
  };
};

export const createEmptySection = (order = 1) => ({
  localId: makeLocalId('section'),
  id: null,
  title: '',
  order,
  body_md: '',
  images: [],
  cases: [],
  misconceptions: [],
  checkpoints: [createEmptyCheckpoint('mcq')],
});

const normalizeArrayItems = (items, normalizer, createFallback, { allowEmpty = false } = {}) => {
  if (!items || !Array.isArray(items) || items.length === 0) {
    if (allowEmpty) return [];
    return [createFallback()];
  }
  return items.map(normalizer);
};

const normalizeImage = (image) => ({
  ...createEmptyImage(),
  ...image,
  localId: image?.localId || makeLocalId('image'),
});

const normalizeCase = (item) => ({
  ...createEmptyCase(),
  ...item,
  localId: item?.localId || makeLocalId('case'),
});

const normalizeMisconception = (item) => ({
  ...createEmptyMisconception(),
  ...item,
  localId: item?.localId || makeLocalId('misconception'),
});

const normalizeCheckpoint = (item) => {
  const type = item?.type === 'short' ? 'short' : 'mcq';
  if (type === 'mcq') {
    const options = ensureArray(item?.options).slice(0, 5);
    while (options.length < 4) {
      options.push('');
    }
    const correctIndex = clamp(
      Number.isInteger(item?.correct_index) ? item.correct_index : 0,
      0,
      Math.max(options.length - 1, 0),
    );
    return {
      ...createEmptyCheckpoint('mcq'),
      ...item,
      type: 'mcq',
      options,
      correct_index: correctIndex,
      bloom_level: sanitizeBloomLevel(item?.bloom_level),
      localId: item?.localId || makeLocalId('checkpoint'),
      hints: ensureArray(item?.hints).length ? ensureArray(item.hints) : [''],
      answer_patterns: ensureArray(item?.answer_patterns),
    };
  }

  return {
    ...createEmptyCheckpoint('short'),
    ...item,
    type: 'short',
    bloom_level: sanitizeBloomLevel(item?.bloom_level),
    localId: item?.localId || makeLocalId('checkpoint'),
    hints: ensureArray(item?.hints).length ? ensureArray(item.hints) : [''],
    answer_patterns: ensureArray(item?.answer_patterns).length
      ? ensureArray(item.answer_patterns)
      : [''],
  };
};

const withSectionOrder = (sections) =>
  sections.map((section, index) => ({
    ...section,
    order: index + 1,
  }));

const normalizeSection = (section, index = 0) => {
  const base = createEmptySection(index + 1);
  const normalized = {
    ...base,
    ...section,
    localId: section?.localId || base.localId,
    id: section?.id ?? base.id,
    title: section?.title ?? base.title,
    order: typeof section?.order === 'number' ? section.order : index + 1,
    body_md: section?.body_md ?? base.body_md,
    images: normalizeArrayItems(section?.images, normalizeImage, createEmptyImage, {
      allowEmpty: true,
    }),
    cases: normalizeArrayItems(section?.cases, normalizeCase, createEmptyCase, {
      allowEmpty: true,
    }),
    misconceptions: normalizeArrayItems(
      section?.misconceptions,
      normalizeMisconception,
      createEmptyMisconception,
      { allowEmpty: true },
    ),
    checkpoints: normalizeArrayItems(
      section?.checkpoints,
      normalizeCheckpoint,
      () => createEmptyCheckpoint('mcq'),
    ),
  };

  // Ensure at least one MCQ checkpoint has options populated to avoid validator failures.
  if (
    normalized.checkpoints.length > 0 &&
    normalized.checkpoints[0].type === 'mcq' &&
    normalized.checkpoints[0].options.length === 0
  ) {
    normalized.checkpoints[0].options = ['', '', '', ''];
  }

  return normalized;
};

export const normalizeTopic = (input) => {
  const topic = input && typeof input === 'object' ? input : {};
  const objectives = ensureArray(topic.objectives).filter((value) => value != null);
  const keyPoints = ensureArray(topic.key_points).filter((value) => value != null);
  const sections = ensureArray(topic.sections).map(normalizeSection);
  const orderedSections = withSectionOrder(sections.length ? sections : [normalizeSection({})]);

  return {
    objectives,
    sections: orderedSections,
    key_points: keyPoints,
  };
};

const deepClone = (value) => JSON.parse(JSON.stringify(value));

const reorderList = (list, fromIndex, toIndex) => {
  if (fromIndex === toIndex) return list.slice();
  const next = list.slice();
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
};

const findSectionIndex = (sections, sectionId) =>
  sections.findIndex((section) => section.localId === sectionId || section.id === sectionId);

export const EditorActionTypes = {
  RESET: 'RESET',
  SET_TOPIC_ARRAY: 'SET_TOPIC_ARRAY',
  ADD_SECTION: 'ADD_SECTION',
  UPDATE_SECTION: 'UPDATE_SECTION',
  REMOVE_SECTION: 'REMOVE_SECTION',
  CLONE_SECTION: 'CLONE_SECTION',
  REORDER_SECTION: 'REORDER_SECTION',
  ADD_SECTION_ITEM: 'ADD_SECTION_ITEM',
  UPDATE_SECTION_ITEM: 'UPDATE_SECTION_ITEM',
  REMOVE_SECTION_ITEM: 'REMOVE_SECTION_ITEM',
  REORDER_SECTION_ITEM: 'REORDER_SECTION_ITEM',
};

export const createEditorState = (rawTopic) => {
  const normalized = normalizeTopic(rawTopic);
  return {
    topic: normalized,
    baseline: deepClone(normalized),
    isDirty: false,
    lastChange: Date.now(),
  };
};

const markDirty = (state) => ({
  ...state,
  isDirty: true,
  lastChange: Date.now(),
});

const sanitizeDraftArray = (values) =>
  ensureArray(values).map((entry) => {
    if (entry == null) return '';
    const asString = String(entry);
    return asString;
  });

const setTopicArray = (state, field, values) => {
  const nextTopic = {
    ...state.topic,
    [field]: sanitizeDraftArray(values),
  };
  return markDirty({ ...state, topic: nextTopic });
};

const addSection = (state, payload) => {
  const { afterId = null } = payload || {};
  const sections = state.topic.sections.slice();
  const index = afterId ? findSectionIndex(sections, afterId) + 1 : sections.length;
  const nextSection = normalizeSection(payload?.section || {});
  sections.splice(index, 0, nextSection);
  const ordered = withSectionOrder(sections);
  return markDirty({
    ...state,
    topic: {
      ...state.topic,
      sections: ordered,
    },
  });
};

const updateSection = (state, payload) => {
  const { sectionId, changes } = payload || {};
  const sections = state.topic.sections.slice();
  const index = findSectionIndex(sections, sectionId);
  if (index === -1) return state;
  const nextSection = {
    ...sections[index],
    ...changes,
  };
  sections[index] = normalizeSection(nextSection, index);
  return markDirty({
    ...state,
    topic: {
      ...state.topic,
      sections,
    },
  });
};

const removeSection = (state, payload) => {
  const { sectionId } = payload || {};
  const sections = state.topic.sections.filter(
    (section) => section.localId !== sectionId && section.id !== sectionId,
  );
  const nextSections = withSectionOrder(sections.length ? sections : [normalizeSection({})]);
  return markDirty({
    ...state,
    topic: {
      ...state.topic,
      sections: nextSections,
    },
  });
};

const cloneSection = (state, payload) => {
  const { sectionId } = payload || {};
  const sections = state.topic.sections.slice();
  const index = findSectionIndex(sections, sectionId);
  if (index === -1) return state;
  const clone = deepClone(sections[index]);
  // Reset identifiers so the clone is treated as new
  const clonedSection = normalizeSection({
    ...clone,
    localId: makeLocalId('section'),
    id: null,
    checkpoints: clone.checkpoints.map((checkpoint) => ({
      ...checkpoint,
      id: null,
      localId: makeLocalId('checkpoint'),
    })),
  });
  sections.splice(index + 1, 0, clonedSection);
  return markDirty({
    ...state,
    topic: {
      ...state.topic,
      sections: withSectionOrder(sections),
    },
  });
};

const reorderSection = (state, payload) => {
  const { fromIndex, toIndex } = payload || {};
  if (fromIndex == null || toIndex == null) return state;
  const sections = reorderList(state.topic.sections, fromIndex, toIndex);
  return markDirty({
    ...state,
    topic: {
      ...state.topic,
      sections: withSectionOrder(sections),
    },
  });
};

const addSectionItem = (state, payload) => {
  const { sectionId, itemType, item } = payload || {};
  const sections = state.topic.sections.slice();
  const index = findSectionIndex(sections, sectionId);
  if (index === -1) return state;
  const section = sections[index];
  const items = ensureArray(section[itemType]);

  const createMap = {
    images: createEmptyImage,
    cases: createEmptyCase,
    misconceptions: createEmptyMisconception,
    checkpoints: () => createEmptyCheckpoint(payload?.checkpointType || 'mcq'),
  };

  const normalizerMap = {
    images: normalizeImage,
    cases: normalizeCase,
    misconceptions: normalizeMisconception,
    checkpoints: normalizeCheckpoint,
  };

  if (!createMap[itemType]) return state;

  const nextItems = [
    ...items,
    item ? normalizerMap[itemType](item) : createMap[itemType](),
  ];
  const nextSection = {
    ...section,
    [itemType]: nextItems,
  };
  sections[index] = normalizeSection(nextSection, index);
  return markDirty({
    ...state,
    topic: {
      ...state.topic,
      sections,
    },
  });
};

const updateSectionItem = (state, payload) => {
  const { sectionId, itemType, itemId, changes } = payload || {};
  const sections = state.topic.sections.slice();
  const index = findSectionIndex(sections, sectionId);
  if (index === -1) return state;

  const section = sections[index];
  const items = ensureArray(section[itemType]);
  const itemIndex = items.findIndex(
    (entry) => entry.localId === itemId || entry.id === itemId,
  );
  if (itemIndex === -1) return state;

  const normalizerMap = {
    images: normalizeImage,
    cases: normalizeCase,
    misconceptions: normalizeMisconception,
    checkpoints: normalizeCheckpoint,
  };
  if (!normalizerMap[itemType]) return state;

  const nextItems = items.slice();
  nextItems[itemIndex] = normalizerMap[itemType]({
    ...items[itemIndex],
    ...changes,
  });

  const nextSection = {
    ...section,
    [itemType]: nextItems,
  };

  sections[index] = normalizeSection(nextSection, index);
  return markDirty({
    ...state,
    topic: {
      ...state.topic,
      sections,
    },
  });
};

const removeSectionItem = (state, payload) => {
  const { sectionId, itemType, itemId } = payload || {};
  const sections = state.topic.sections.slice();
  const index = findSectionIndex(sections, sectionId);
  if (index === -1) return state;

  const section = sections[index];
  const items = ensureArray(section[itemType]);
  if (!items.length) return state;

  const filtered = items.filter(
    (entry) => entry.localId !== itemId && entry.id !== itemId,
  );

  const ensureAtLeastOne = (list, factory) =>
    list.length ? list : [factory()];

  const factoryMap = {
    checkpoints: () => createEmptyCheckpoint('mcq'),
  };

  const nextItems =
    itemType === 'checkpoints'
      ? ensureAtLeastOne(filtered, factoryMap[itemType] || (() => ({})))
      : filtered;

  const nextSection = {
    ...section,
    [itemType]: nextItems,
  };

  sections[index] = normalizeSection(nextSection, index);
  return markDirty({
    ...state,
    topic: {
      ...state.topic,
      sections,
    },
  });
};

const reorderSectionItem = (state, payload) => {
  const { sectionId, itemType, fromIndex, toIndex } = payload || {};
  const sections = state.topic.sections.slice();
  const index = findSectionIndex(sections, sectionId);
  if (index === -1) return state;

  const section = sections[index];
  const items = ensureArray(section[itemType]);
  if (fromIndex == null || toIndex == null || !items.length) return state;

  const nextItems = reorderList(items, fromIndex, toIndex);
  const nextSection = {
    ...section,
    [itemType]: nextItems,
  };
  sections[index] = normalizeSection(nextSection, index);
  return markDirty({
    ...state,
    topic: {
      ...state.topic,
      sections,
    },
  });
};

export const structuredEditorReducer = (state, action) => {
  switch (action?.type) {
    case EditorActionTypes.RESET: {
      const nextTopic = normalizeTopic(action.payload?.topic);
      return {
        topic: nextTopic,
        baseline: deepClone(nextTopic),
        isDirty: false,
        lastChange: Date.now(),
      };
    }
    case EditorActionTypes.SET_TOPIC_ARRAY:
      return setTopicArray(state, action.payload?.field, action.payload?.values);
    case EditorActionTypes.ADD_SECTION:
      return addSection(state, action.payload);
    case EditorActionTypes.UPDATE_SECTION:
      return updateSection(state, action.payload);
    case EditorActionTypes.REMOVE_SECTION:
      return removeSection(state, action.payload);
    case EditorActionTypes.CLONE_SECTION:
      return cloneSection(state, action.payload);
    case EditorActionTypes.REORDER_SECTION:
      return reorderSection(state, action.payload);
    case EditorActionTypes.ADD_SECTION_ITEM:
      return addSectionItem(state, action.payload);
    case EditorActionTypes.UPDATE_SECTION_ITEM:
      return updateSectionItem(state, action.payload);
    case EditorActionTypes.REMOVE_SECTION_ITEM:
      return removeSectionItem(state, action.payload);
    case EditorActionTypes.REORDER_SECTION_ITEM:
      return reorderSectionItem(state, action.payload);
    default:
      return state;
  }
};

export const selectTopic = (state) => state.topic;
export const selectSections = (state) => state.topic.sections;
export const selectObjectives = (state) => state.topic.objectives;
export const selectKeyPoints = (state) => state.topic.key_points;

export const hasMeaningfulChanges = (state) => {
  try {
    return JSON.stringify(state.topic) !== JSON.stringify(state.baseline);
  } catch (error) {
    console.warn('Failed comparing editor state', error);
    return state.isDirty;
  }
};

export const resetDirtyFlag = (state) => ({
  ...state,
  baseline: deepClone(state.topic),
  isDirty: false,
});
