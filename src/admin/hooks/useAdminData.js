import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../../firebase';

const SECTIONS_QUERY_KEY = ['admin', 'sections'];

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

const computeStatusMap = (nodes, childrenByTopicId) => {
  const statusMemo = {};
  const byTopicId = new Map(nodes.map((node) => [node.topicId || node.id, node]));

  const determineStatus = (topicId) => {
    if (statusMemo[topicId]) return statusMemo[topicId];

    const node = byTopicId.get(topicId);
    if (!node) {
      statusMemo[topicId] = 'grey';
      return statusMemo[topicId];
    }

    const children = childrenByTopicId.get(topicId) || [];
    const hasContent =
      !!node.mainContent?.ops?.[0]?.insert?.trim() ||
      !!node.structuredContent?.length ||
      !!node.contentSections?.length;

    if (children.length === 0) {
      statusMemo[topicId] = hasContent ? 'green' : 'grey';
      return statusMemo[topicId];
    }

    const childStatuses = children.map((child) => determineStatus(child.topicId || child.id));
    const allGreen = childStatuses.every((status) => status === 'green');
    const anyGreen = childStatuses.some((status) => status === 'green');
    const anyYellow = childStatuses.some((status) => status === 'yellow');

    if ((allGreen && hasContent) || (allGreen && children.length === 0)) {
      statusMemo[topicId] = 'green';
    } else if (anyGreen || anyYellow || hasContent) {
      statusMemo[topicId] = 'yellow';
    } else {
      statusMemo[topicId] = 'grey';
    }
    return statusMemo[topicId];
  };

  nodes.forEach((node) => {
    determineStatus(node.topicId || node.id);
  });

  return statusMemo;
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

export const useSectionNodes = (sectionId) => {
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
    const statusMap = computeStatusMap(nodes, index.childrenByTopicId);

    return {
      nodes,
      roots: index.roots,
      statusMap,
      index,
    };
  }, [queryResult.data]);

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
  if (!organId || !topicId) return null;
  const response = await fetch(`/content?organ=${organId}&topicId=${topicId}`);
  if (!response.ok) {
    throw new Error(`Failed to load structured content (${response.status})`);
  }
  const payload = await response.json();
  return payload?.structuredContent ?? null;
};

export const useStructuredContent = ({ organId, topicId, enabled = true }) =>
  useQuery({
    queryKey: ['admin', 'structured-content', organId, topicId],
    queryFn: () => fetchStructuredContent({ organId, topicId }),
    enabled: enabled && !!organId && !!topicId,
    staleTime: 60 * 1000,
  });
