import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  orderBy,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../../firebase';
import {
  adaptStudyItemContent,
  computeStatusMap,
  getStudyItemPath,
  getStructuredContentPath,
  hasPublishedStructuredContent,
} from '../utils/contentStatus';

const SECTIONS_QUERY_KEY = ['admin', 'sections'];
const EMPTY_DISCOVERED_COUNTS = {};
const API_BASE = (process.env.REACT_APP_API_BASE_URL || '').replace(/\/$/, '');

const fetchSections = async () => {
  const sectionsRef = collection(db, 'sections');
  const snapshot = await getDocs(query(sectionsRef, orderBy('title')));
  return snapshot.docs.map((document) => {
    const data = document.data() || {};
    return {
      id: document.id,
      title: data.title ?? data.name ?? 'Untitled Section',
      description: data.description ?? '',
      updatedAt: data.updatedAt ?? null,
      ...data,
    };
  });
};

export const useAdminSections = () =>
  useQuery({
    queryKey: SECTIONS_QUERY_KEY,
    queryFn: fetchSections,
    staleTime: 5 * 60 * 1000,
  });

const buildNodeIndex = (nodes) => {
  const byDocId = new Map();
  const byTopicId = new Map();
  const childrenByTopicId = new Map();
  const parentByTopicId = new Map();

  nodes.forEach((node) => {
    const topicKey = node.topicId || node.id;
    byDocId.set(node.id, node);
    if (!byTopicId.has(topicKey)) {
      byTopicId.set(topicKey, node);
    }
    if (node.parentId) {
      parentByTopicId.set(node.topicId || node.id, node.parentId);
      if (!childrenByTopicId.has(node.parentId)) {
        childrenByTopicId.set(node.parentId, []);
      }
      childrenByTopicId.get(node.parentId).push(node);
    }
  });

  const roots = nodes
    .filter((node) => !node.parentId)
    .sort((a, b) => {
      const orderA = typeof a.order === 'number' ? a.order : 0;
      const orderB = typeof b.order === 'number' ? b.order : 0;
      if (orderA !== orderB) return orderA - orderB;
      return (a.title || a.name || '').localeCompare(b.title || b.name || '');
    });

  childrenByTopicId.forEach((list) => {
    list.sort((a, b) => {
      const orderA = typeof a.order === 'number' ? a.order : 0;
      const orderB = typeof b.order === 'number' ? b.order : 0;
      if (orderA !== orderB) return orderA - orderB;
      return (a.title || a.name || '').localeCompare(b.title || b.name || '');
    });
  });

  return {
    roots,
    byDocId,
    byTopicId,
    childrenByTopicId,
    parentByTopicId,
  };
};

const fetchSectionNodes = async ({ sectionId }) => {
  if (!sectionId) return [];
  const nodesRef = collection(db, 'sections', sectionId, 'nodes');
  const snapshot = await getDocs(query(nodesRef, orderBy('order')));
  return snapshot.docs.map((document) => {
    const data = document.data() || {};
    return {
      id: document.id,
      topicId: data.topicId ?? document.id,
      title: data.title ?? data.name ?? 'Untitled Topic',
      name: data.name ?? data.title ?? 'Untitled Topic',
      category: data.category ?? '',
      parentId: data.parentId ?? null,
      order: data.order ?? null,
      updatedAt: data.updatedAt ?? data.lastModified ?? null,
      mainContent: data.mainContent ?? null,
      structuredContent: data.structuredContent ?? null,
      contentSections: data.contentSections ?? null,
      statusOverride: data.status ?? null,
      ...data,
    };
  });
};

export const useSectionNodes = (sectionId, discoveredCounts = EMPTY_DISCOVERED_COUNTS) => {
  const queryResult = useQuery({
    queryKey: ['admin', 'section-nodes', sectionId],
    queryFn: () => fetchSectionNodes({ sectionId }),
    enabled: !!sectionId,
    staleTime: 2 * 60 * 1000,
  });

  const derived = useMemo(() => {
    const nodes = queryResult.data ?? [];
    if (!nodes.length) {
      return {
        nodes,
        roots: [],
        statusMap: {},
        index: {
          byDocId: new Map(),
          byTopicId: new Map(),
          childrenByTopicId: new Map(),
          parentByTopicId: new Map(),
        },
      };
    }

    const index = buildNodeIndex(nodes);
    const statusMap = computeStatusMap(nodes, index.childrenByTopicId, discoveredCounts);

    return {
      nodes,
      roots: index.roots,
      statusMap,
      index,
    };
  }, [queryResult.data, discoveredCounts]);

  return {
    ...queryResult,
    ...derived,
  };
};

const fetchNodeChildren = async (sectionId, topicId) => {
  const nodesRef = collection(db, 'sections', sectionId, 'nodes');
  const childQuery = query(
    nodesRef,
    where('parentId', '==', topicId),
    orderBy('order'),
  );
  const snapshot = await getDocs(childQuery);
  return snapshot.docs.map((document) => ({
    id: document.id,
    ...(document.data() || {}),
  }));
};

export const useNodeChildren = (sectionId, topicId) =>
  useQuery({
    queryKey: ['admin', 'node-children', sectionId, topicId],
    queryFn: () => fetchNodeChildren(sectionId, topicId),
    enabled: !!sectionId && !!topicId,
    staleTime: 2 * 60 * 1000,
  });

const fetchStructuredContentCounts = async ({ sectionId, nodes }) => {
  if (!sectionId || !nodes?.length) return {};

  const entries = await Promise.all(
    nodes.map(async (node) => {
      if (!node?.id || hasPublishedStructuredContent(node)) {
        return [node?.id, null];
      }

      try {
        const contentSectionsRef = collection(
          db,
          'sections',
          sectionId,
          'nodes',
          node.id,
          'contentSections',
        );
        const snapshot = await getCountFromServer(contentSectionsRef);
        const structuredCount = snapshot.data().count || 0;
        if (structuredCount > 0) {
          return [node.id, { structuredCount, legacy: false, source: 'contentSections' }];
        }

        const studyItemSnap = await getDoc(doc(db, 'study_items', `${sectionId}__${node.id}`));
        if (!studyItemSnap.exists()) {
          return [node.id, { structuredCount: 0, legacy: false, source: 'none' }];
        }

        const adapted = adaptStudyItemContent(studyItemSnap.data() || {});
        return [
          node.id,
          {
            structuredCount: adapted.structuredContent?.sections?.length || 0,
            legacy: Boolean(adapted.legacyText),
            source: `study_items:${adapted.schemaType}`,
          },
        ];
      } catch (error) {
        if (process.env.NODE_ENV !== 'production') {
          // eslint-disable-next-line no-console
          console.warn('[Admin content status] contentSections count failed', {
            title: node.name || node.title,
            nodeId: node.id,
            topicId: node.topicId || null,
            path: getStructuredContentPath(sectionId, node.id),
            studyItemPath: getStudyItemPath(sectionId, node.id),
            code: error?.code || null,
            message: error?.message || String(error),
          });
        }
        return [node.id, null];
      }
    }),
  );

  return entries.reduce((acc, [nodeId, count]) => {
    if (nodeId && count != null) {
      acc[nodeId] = count;
    }
    return acc;
  }, {});
};

export const useStructuredContentCounts = (sectionId, nodes = []) => {
  const missingMetadataNodes = useMemo(
    () => nodes.filter((node) => node?.id && !hasPublishedStructuredContent(node)),
    [nodes],
  );
  const ids = useMemo(
    () => missingMetadataNodes.map((node) => node.id).sort(),
    [missingMetadataNodes],
  );

  return useQuery({
    queryKey: ['admin', 'structured-content-counts', sectionId, ids],
    queryFn: () => fetchStructuredContentCounts({ sectionId, nodes: missingMetadataNodes }),
    enabled: !!sectionId && missingMetadataNodes.length > 0,
    staleTime: 60 * 1000,
  });
};

export const useUpdateNodeMetadata = (sectionId) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ nodeId, name, category }) => {
      if (!sectionId || !nodeId) {
        throw new Error('Missing sectionId or nodeId when updating metadata');
      }
      const topicRef = doc(db, 'sections', sectionId, 'nodes', nodeId);
      await updateDoc(topicRef, {
        name,
        category: category || null,
        title: name,
        updatedAt: Date.now(),
      });
      return { nodeId, name, category };
    },
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'section-nodes', sectionId] });
      queryClient.invalidateQueries({
        queryKey: ['admin', 'node-children', sectionId, variables.nodeId],
      });
    },
  });
};

const fetchStructuredContent = async ({ organId, topicId }) => {
  if (!organId || !topicId) {
    return {
      structuredContent: null,
      legacyText: '',
      source: 'none',
      diagnostics: {},
    };
  }

  const params = new URLSearchParams({ organ: organId, topicId });
  const endpoint = API_BASE ? `${API_BASE}/content?${params}` : `/content?${params}`;
  const diagnostics = {
    endpoint,
    contentPath: getStructuredContentPath(organId, topicId),
    studyItemPath: getStudyItemPath(organId, topicId),
    usedFallback: false,
  };

  const response = await fetch(endpoint);
  if (!response.ok) {
    throw new Error(`Failed to load structured content (${response.status})`);
  }
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new Error(
      `Structured content endpoint returned ${contentType || 'unknown content type'}; check REACT_APP_API_BASE_URL.`,
    );
  }
  const payload = await response.json();
  const structuredContent = payload?.structuredContent ?? null;
  if (structuredContent?.sections?.length) {
    return {
      structuredContent,
      legacyText: '',
      source: 'contentSections',
      diagnostics: {
        ...diagnostics,
        sectionCount: structuredContent.sections.length,
        objectiveCount: structuredContent.objectives?.length || 0,
        keyPointCount: structuredContent.key_points?.length || 0,
      },
    };
  }

  const studyItemSnap = await getDoc(doc(db, 'study_items', `${organId}__${topicId}`));
  if (studyItemSnap.exists()) {
    const studyItem = studyItemSnap.data() || {};
    const adapted = adaptStudyItemContent(studyItem);
    if (adapted.structuredContent?.sections?.length || adapted.legacyText) {
      return {
        structuredContent: adapted.structuredContent,
        legacyText: adapted.legacyText,
        source: `study_items:${adapted.schemaType}`,
        diagnostics: {
          ...diagnostics,
          usedFallback: true,
          studyItemFieldNames: Object.keys(studyItem).sort(),
          sectionCount: adapted.structuredContent?.sections?.length || 0,
          objectiveCount: adapted.structuredContent?.objectives?.length || 0,
          keyPointCount: adapted.structuredContent?.key_points?.length || 0,
          legacyTextLength: adapted.legacyText.length,
        },
      };
    }
  }

  return {
    structuredContent: null,
    legacyText: '',
    source: 'none',
    diagnostics,
  };
};

export const useStructuredContent = ({ organId, topicId, enabled = true }) =>
  useQuery({
    queryKey: ['admin', 'structured-content', organId, topicId],
    queryFn: () => fetchStructuredContent({ organId, topicId }),
    enabled: enabled && !!organId && !!topicId,
    staleTime: 60 * 1000,
  });
