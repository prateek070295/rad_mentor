import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useAdminSections, useSectionNodes } from '../hooks/useAdminData';

const AdminPanelContext = createContext(null);

export const AdminPanelProvider = ({ children }) => {
  const [activeSectionId, setActiveSectionId] = useState(null);
  const [selectedChapterId, setSelectedChapterId] = useState(null);
  const [selectedTopicId, setSelectedTopicId] = useState(null);
  const [selectedNodeId, setSelectedNodeId] = useState(null);

  const sectionsQuery = useAdminSections();
  const sectionNodesQuery = useSectionNodes(activeSectionId);

  useEffect(() => {
    if (!sectionsQuery.data?.length) return;
    if (!activeSectionId) {
      setActiveSectionId(sectionsQuery.data[0].id);
    }
  }, [sectionsQuery.data, activeSectionId]);

  useEffect(() => {
    setSelectedChapterId(null);
    setSelectedTopicId(null);
    setSelectedNodeId(null);
  }, [activeSectionId]);

  useEffect(() => {
    const byDocId = sectionNodesQuery.index?.byDocId;
    if (!byDocId) return;
    if (selectedChapterId && !byDocId.has(selectedChapterId)) {
      setSelectedChapterId(null);
    }
    if (selectedTopicId && !byDocId.has(selectedTopicId)) {
      setSelectedTopicId(null);
    }
    if (selectedNodeId && !byDocId.has(selectedNodeId)) {
      setSelectedNodeId(null);
    }
  }, [sectionNodesQuery.index, selectedChapterId, selectedTopicId, selectedNodeId]);

  const selectChapter = useCallback((chapterId) => {
    setSelectedChapterId(chapterId);
    setSelectedTopicId(null);
    setSelectedNodeId(chapterId);
  }, []);

  const selectTopic = useCallback((topicId) => {
    setSelectedTopicId(topicId);
    setSelectedNodeId(topicId);
  }, []);

  const selectSubtopic = useCallback((subtopicId) => {
    setSelectedNodeId(subtopicId);
  }, []);

  const clearToChapters = useCallback(() => {
    setSelectedChapterId(null);
    setSelectedTopicId(null);
    setSelectedNodeId(null);
  }, []);

  const clearToTopics = useCallback(() => {
    setSelectedTopicId(null);
    setSelectedNodeId(selectedChapterId || null);
  }, [selectedChapterId]);

  const contextValue = useMemo(
    () => ({
      sectionsQuery,
      sectionNodesQuery,
      activeSectionId,
      setActiveSectionId,
      selectedChapterId,
      selectedTopicId,
      selectedNodeId,
      selectChapter,
      selectTopic,
      selectSubtopic,
      clearToChapters,
      clearToTopics,
    }),
    [
      sectionsQuery,
      sectionNodesQuery,
      activeSectionId,
      selectedChapterId,
      selectedTopicId,
      selectedNodeId,
      selectChapter,
      selectTopic,
      selectSubtopic,
      clearToChapters,
      clearToTopics,
    ],
  );

  return <AdminPanelContext.Provider value={contextValue}>{children}</AdminPanelContext.Provider>;
};

export const useAdminPanel = () => {
  const context = useContext(AdminPanelContext);
  if (!context) {
    throw new Error('useAdminPanel must be used within an AdminPanelProvider');
  }
  return context;
};
