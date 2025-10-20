import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, orderBy, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { runTasksWithConcurrency } from '../components/learn/helpers';

const normalizeKey = (value) =>
  value == null ? '' : String(value).trim().toLowerCase();

/**
 * Fetches chapter metadata (topics, descendants, etc.) required for the Learn sidebar.
 */
const useChapterDetails = (chapters = [], focusDetails = []) => {
  const [sourceTopicsTree, setSourceTopicsTree] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const memoizedChapters = useMemo(
    () => (Array.isArray(chapters) ? chapters : []),
    [chapters],
  );
  const memoizedFocus = useMemo(
    () => (Array.isArray(focusDetails) ? focusDetails : []),
    [focusDetails],
  );

  useEffect(() => {
    let isCancelled = false;

    const fetchSourceData = async () => {
      if (!memoizedChapters.length) {
        setSourceTopicsTree([]);
        setLoading(false);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const buildChapterFactories = memoizedChapters
          .map((chapter) => {
            if (!chapter?.sectionName || !chapter?.chapterName) {
              return null;
            }

            return async () => {
              const sectionsRef = collection(db, 'sections');
              const sectionQuery = query(
                sectionsRef,
                where('title', '==', chapter.sectionName),
              );
              const sectionSnapshot = await getDocs(sectionQuery);
              if (sectionSnapshot.empty) {
                throw new Error(`Section "${chapter.sectionName}" not found.`);
              }
              const sectionDoc = sectionSnapshot.docs[0];

              const nodesRef = collection(
                db,
                'sections',
                sectionDoc.id,
                'nodes',
              );
              const chapterQuery = query(
                nodesRef,
                where('name', '==', chapter.chapterName),
                where('parentId', '==', null),
              );
              const chapterSnapshot = await getDocs(chapterQuery);
              if (chapterSnapshot.empty) {
                throw new Error(
                  `Chapter "${chapter.chapterName}" not found.`,
                );
              }
              const chapterData = chapterSnapshot.docs[0].data();

              const allTopicsQuery = query(
                nodesRef,
                where('path', 'array-contains', chapterData.name),
                orderBy('order'),
              );
              const allTopicsSnapshot = await getDocs(allTopicsQuery);
              const descendantTopics = allTopicsSnapshot.docs.map((d) => ({
                id: d.id,
                ...d.data(),
              }));

              const nodeMap = new Map();
              descendantTopics.forEach((topic) => {
                topic.children = [];
                nodeMap.set(topic.topicId, topic);
              });

              const rootTopics = [];
              descendantTopics.forEach((topic) => {
                if (topic.parentId === chapterData.topicId) {
                  rootTopics.push(topic);
                } else if (topic.parentId && nodeMap.has(topic.parentId)) {
                  const parent = nodeMap.get(topic.parentId);
                  if (parent) parent.children.push(topic);
                }
              });

              const cloneNode = (node) => ({
                ...node,
                children: Array.isArray(node?.children)
                  ? node.children.map(cloneNode)
                  : [],
              });

              const focusDetailsForFilter =
                Array.isArray(chapter.focusDetails) &&
                chapter.focusDetails.length > 0
                  ? chapter.focusDetails
                  : memoizedFocus;
              const hasFocusedDetails =
                Array.isArray(focusDetailsForFilter) &&
                focusDetailsForFilter.length > 0;
              let filteredRoots = rootTopics;

              if (hasFocusedDetails) {
                const allowedTopicIds = new Set();
                const allowedTopicNames = new Set();
                const allowedSubtopicIds = new Set();
                const allowedSubtopicNames = new Set();

                const addTokens = (set, value) => {
                  if (value == null) return;
                  const raw = String(value);
                  set.add(normalizeKey(raw));
                  raw.split(':').forEach((segment) =>
                    set.add(normalizeKey(segment)),
                  );
                };

                focusDetailsForFilter.forEach((detail) => {
                  (detail?.topicIds || []).forEach((id) =>
                    allowedTopicIds.add(normalizeKey(id)),
                  );
                  (detail?.topics || []).forEach((topic) =>
                    addTokens(allowedTopicNames, topic),
                  );
                  (detail?.subtopicIds || []).forEach((id) =>
                    allowedSubtopicIds.add(normalizeKey(id)),
                  );
                  (detail?.subtopics || []).forEach((sub) =>
                    addTokens(allowedSubtopicNames, sub),
                  );
                });

                const collectIds = (node) =>
                  [
                    normalizeKey(node?.topicId),
                    normalizeKey(node?.itemId),
                    normalizeKey(node?.id),
                    normalizeKey(node?.topicID),
                    normalizeKey(node?.nodeId),
                    normalizeKey(node?.chapterId),
                    normalizeKey(node?.topicid),
                  ].filter(Boolean);

                const filterChildren = (children) => {
                  if (!Array.isArray(children) || children.length === 0) {
                    return [];
                  }
                  return children
                    .map((child) => {
                      const clone = cloneNode(child);
                      clone.children = filterChildren(clone.children);
                      const childIds = collectIds(child);
                      const childNameKey = normalizeKey(child?.name);
                      const matches =
                        childIds.some((id) => allowedSubtopicIds.has(id)) ||
                        allowedSubtopicNames.has(childNameKey);
                      if (
                        allowedSubtopicIds.size === 0 &&
                        allowedSubtopicNames.size === 0
                      ) {
                        return clone;
                      }
                      if (matches || clone.children.length > 0) {
                        return clone;
                      }
                      return null;
                    })
                    .filter(Boolean);
                };

                const selectedRoots = [];
                const usedKeys = new Set();

                const canonicalKeyForRoot = (root) => {
                  if (!root) return null;
                  const firstId = collectIds(root).find((id) => !!id);
                  if (firstId) return `id:${firstId}`;
                  const nameKey = normalizeKey(root?.name);
                  return nameKey ? `name:${nameKey}` : null;
                };

                const pushRoot = (root, attemptedKey) => {
                  if (!root) return;
                  const canonicalKey = canonicalKeyForRoot(root) || attemptedKey;
                  if (!canonicalKey || usedKeys.has(canonicalKey)) return;
                  const clone = cloneNode(root);
                  clone.children = filterChildren(clone.children);
                  selectedRoots.push(clone);
                  usedKeys.add(canonicalKey);
                };

                const findRootById = (idKey) =>
                  rootTopics.find((root) =>
                    collectIds(root).some((id) => id === idKey),
                  );
                const findRootByName = (nameKey) =>
                  rootTopics.find(
                    (root) => normalizeKey(root?.name) === nameKey,
                  );

                allowedTopicIds.forEach((idKey) => {
                  const root = findRootById(idKey);
                  pushRoot(root, `id:${idKey}`);
                });

                allowedTopicNames.forEach((nameKey) => {
                  const root = findRootByName(nameKey);
                  pushRoot(root, `name:${nameKey}`);
                });

                if (selectedRoots.length > 0) {
                  filteredRoots = selectedRoots;
                } else {
                  filteredRoots = rootTopics
                    .map((root) => {
                      const ids = collectIds(root);
                      const nameKey = normalizeKey(root?.name);
                      if (
                        ids.some((id) => allowedTopicIds.has(id)) ||
                        allowedTopicNames.has(nameKey)
                      ) {
                        const clone = cloneNode(root);
                        clone.children = filterChildren(clone.children);
                        return clone;
                      }
                      return null;
                    })
                    .filter(Boolean);
                }

                if (filteredRoots.length === 0) {
                  filteredRoots = rootTopics.map(cloneNode);
                }
              }

              return {
                key: chapter.key,
                sectionName: chapter.sectionName,
                chapterName: chapter.chapterName,
                topics: filteredRoots,
              };
            };
          })
          .filter(Boolean);

        const outcomes = await runTasksWithConcurrency(
          buildChapterFactories,
          20,
        );
        if (isCancelled) return;

        const results = outcomes
          .filter((outcome) => outcome?.status === 'fulfilled' && outcome.value)
          .map((outcome) => outcome.value);
        setSourceTopicsTree(results);
        setError(null);
      } catch (err) {
        if (isCancelled) return;
        setSourceTopicsTree([]);
        setError(err);
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    fetchSourceData();
    return () => {
      isCancelled = true;
    };
  }, [memoizedChapters, memoizedFocus]);

  return { sourceTopicsTree, loading, error };
};

export default useChapterDetails;
