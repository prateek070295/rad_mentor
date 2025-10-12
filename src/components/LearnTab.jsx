import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { db, auth } from '../firebase';
import { collection, getDocs, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import ReactMarkdown from 'react-markdown';
import TopicNode from './TopicNode';
import MCQForm from './MCQForm';

const API_BASE = (process.env.REACT_APP_API_BASE_URL || '').replace(/\/$/, '');

// This hook for fetching user progress is correct and remains unchanged.
const useUserProgress = (organIds) => {

  const [progress, setProgress] = useState(new Map());

  const [isLoading, setIsLoading] = useState(true);

  const { rawIds, lowerIds, organKey } = useMemo(() => {

    if (!Array.isArray(organIds) || organIds.length === 0) {

      return { rawIds: [], lowerIds: [], organKey: "" };

    }

    const seenLower = new Set();

    const rawList = [];

    organIds.forEach((value) => {

      if (value == null) return;

      const trimmed = String(value).trim();

      if (!trimmed) return;

      const lower = trimmed.toLowerCase();

      if (seenLower.has(lower)) return;

      seenLower.add(lower);

      rawList.push(trimmed);

    });

    rawList.sort((a, b) => a.localeCompare(b));

    return {

      rawIds: rawList,

      lowerIds: rawList.map((value) => value.toLowerCase()),

      organKey: rawList.join("|"),

    };

  }, [organIds]);

  const userId = auth.currentUser?.uid || null;



  useEffect(() => {
    if (!userId) {
      setProgress(new Map());
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const allowedLower = new Set(lowerIds);
    const includeAll = allowedLower.size === 0;
    const listeners = [];
    const localMap = new Map();
    const progressRef = collection(db, "userProgress", userId, "topics");
    let isMounted = true;

    const emit = () => {
      if (!isMounted) return;
      setProgress(new Map(localMap));
    };

    const finishLoading = () => {
      if (!isMounted) return;
      setIsLoading(false);
    };

    const detachAll = () => {
      listeners.forEach((unsubscribe) => {
        try {
          unsubscribe?.();
        } catch (err) {
          console.error("Failed to unsubscribe progress listener", err);
        }
      });
    };

    if (includeAll) {
      const unsubscribe = onSnapshot(
        progressRef,
        (snapshot) => {
          localMap.clear();
          snapshot.forEach((doc) => {
            const data = doc.data() || {};
            localMap.set(doc.id, { id: doc.id, ...data });
          });
          emit();
          finishLoading();
        },
        (error) => {
          console.error("Error fetching real-time user progress:", error);
          finishLoading();
        },
      );
      listeners.push(unsubscribe);
    } else {
      if (!rawIds.length) {
        localMap.clear();
        emit();
        finishLoading();
      } else {
        const readySet = new Set();
        const total = rawIds.length;
        rawIds.forEach((chapterIdRaw) => {
          const chapterId = chapterIdRaw;
          const chapterLower = chapterId.toLowerCase();
          const listener = onSnapshot(
            query(progressRef, where("chapterId", "==", chapterId)),
            (snapshot) => {
              const activeDocIds = new Set();
              snapshot.forEach((doc) => {
                activeDocIds.add(doc.id);
                const data = doc.data() || {};
                localMap.set(doc.id, { id: doc.id, ...data });
              });

              for (const [docId, value] of Array.from(localMap.entries())) {
                const docChapterLower = String(value?.chapterId || "")
                  .trim()
                  .toLowerCase();
                if (docChapterLower === chapterLower && !activeDocIds.has(docId)) {
                  localMap.delete(docId);
                }
              }

              emit();
              readySet.add(chapterId);
              if (readySet.size >= total) {
                finishLoading();
              }
            },
            (error) => {
              console.error("Error fetching real-time user progress:", error);
              readySet.add(chapterId);
              if (readySet.size >= total) {
                finishLoading();
              }
            },
          );
          listeners.push(listener);
        });
      }
    }

    return () => {
      isMounted = false;
      detachAll();
    };
  }, [userId, organKey, rawIds, lowerIds]);

  return { progress, isLoading };

};



const LearnTab = ({ todayFocus, todayFocusDetails = [], userName, setIsFocusMode }) => {
  // UI State
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [scheduledChapters, setScheduledChapters] = useState([]);
  const [chapterGroups, setChapterGroups] = useState([]); // grouped topics per chapter
  const [isSidebarLoading, setIsSidebarLoading] = useState(true);
  
  // NEW: State to hold the static, fetched tree structure.
  const [sourceTopicsTree, setSourceTopicsTree] = useState([]);

  // Tutor State
  const [tutorHistory, setTutorHistory] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [isMentorTyping, setIsMentorTyping] = useState(false);
  const [activeTopic, setActiveTopic] = useState(null);
  const lastCardRef = useRef(null);
  
  const { progress: userProgress, isLoading: isProgressLoading } = useUserProgress(
    scheduledChapters.map((chapter) => chapter.sectionName),
  );

  useEffect(() => {
    if (setIsFocusMode) {
      setIsFocusMode(!isSidebarOpen);
    }
  }, [isSidebarOpen, setIsFocusMode]);

  // EFFECT 1: Parse today's focus (Unchanged)
  useEffect(() => {
    const parseFocusString = (fullFocusString) => {
      if (!fullFocusString) return null;
      const parts = fullFocusString.split(":");
      if (parts.length < 2) return null;
      const sectionName = parts[0].trim();
      const topicWithDay = parts.slice(1).join(":").trim();
      const chapterName = topicWithDay.replace(/\(Day \d+ of \d+\)/, "").trim();
      return { sectionName, chapterName };
    };

    const chapterKeyFor = (sectionName, chapterName) =>
      `${sectionName || ""}:::${chapterName || ""}`;

    const groupedChapters = new Map();
    if (Array.isArray(todayFocusDetails) && todayFocusDetails.length > 0) {
      todayFocusDetails.forEach((detail) => {
        const sectionName = detail?.sectionName?.trim();
        const chapterName = detail?.chapterName?.trim();
        if (!sectionName || !chapterName) return;
        const key = chapterKeyFor(sectionName, chapterName);
        if (!groupedChapters.has(key)) {
          groupedChapters.set(key, {
            key,
            sectionName,
            chapterName,
            focusDetails: [],
          });
        }
        groupedChapters.get(key).focusDetails.push(detail);
      });
    }

    let chapters = Array.from(groupedChapters.values());

    if (chapters.length === 0) {
      const focusData = parseFocusString(todayFocus);
      if (focusData?.sectionName && focusData?.chapterName) {
        chapters = [
          {
            key: chapterKeyFor(focusData.sectionName, focusData.chapterName),
            sectionName: focusData.sectionName,
            chapterName: focusData.chapterName,
            focusDetails: [],
          },
        ];
      }
    }

    setScheduledChapters(chapters);
  }, [todayFocus, todayFocusDetails]);

  // EFFECT 2: Fetch the source topic structure ONCE when the chapter changes.
  useEffect(() => {
    let isCancelled = false;
    const fetchSourceData = async () => {
      if (!scheduledChapters.length) {
        setSourceTopicsTree([]);
        setIsSidebarLoading(false);
        return;
      }

      setIsSidebarLoading(true);
      try {
        const normalizeKey = (value) =>
          value == null ? "" : String(value).trim().toLowerCase();
        const results = [];

        for (const chapter of scheduledChapters) {
          if (!chapter?.sectionName || !chapter?.chapterName) continue;

          try {
            const sectionsRef = collection(db, "sections");
            const sectionQuery = query(
              sectionsRef,
              where("title", "==", chapter.sectionName),
            );
            const sectionSnapshot = await getDocs(sectionQuery);
            if (sectionSnapshot.empty)
              throw new Error(
                `Section "${chapter.sectionName}" not found.`,
              );
            const sectionDoc = sectionSnapshot.docs[0];

            const nodesRef = collection(db, "sections", sectionDoc.id, "nodes");
            const chapterQuery = query(
              nodesRef,
              where("name", "==", chapter.chapterName),
              where("parentId", "==", null),
            );
            const chapterSnapshot = await getDocs(chapterQuery);
            if (chapterSnapshot.empty)
              throw new Error(
                `Chapter "${chapter.chapterName}" not found.`,
              );
            const chapterData = chapterSnapshot.docs[0].data();

            const allTopicsQuery = query(
              nodesRef,
              where("path", "array-contains", chapterData.name),
              orderBy("order"),
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
                : todayFocusDetails;
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
                raw.split(":").forEach((segment) =>
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
                if (!Array.isArray(children) || children.length === 0)
                  return [];
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
                      return clone.children.length > 0 || matches
                        ? clone
                        : clone;
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

            results.push({
              key: chapter.key,
              sectionName: chapter.sectionName,
              chapterName: chapter.chapterName,
              topics: filteredRoots,
            });
          } catch (chapterErr) {
            console.error(
              `Failed to fetch data for ${chapter.chapterName}:`,
              chapterErr,
            );
          }
        }

        if (!isCancelled) {
          setSourceTopicsTree(results);
        }
      } catch (err) {
        console.error("Failed to fetch sidebar data:", err);
      } finally {
        if (!isCancelled) {
          setIsSidebarLoading(false);
        }
      }
    };
    fetchSourceData();
    return () => {
      isCancelled = true;
    };
  }, [scheduledChapters, todayFocusDetails]);

  // EFFECT 3: Merge the static tree with REAL-TIME progress updates.
  useEffect(() => {
    if (!Array.isArray(sourceTopicsTree) || sourceTopicsTree.length === 0) {
      setChapterGroups([]);
      return;
    }

    const mergeRecursively = (topics, chapterId, chapterName) =>
      topics.map((topic) => {
        const progressEntry = userProgress.get(topic.id);
        const merged = {
          ...topic,
          status: progressEntry?.status || "not-started",
          percentComplete: progressEntry?.percentComplete || 0,
          chapterId,
          chapterName,
        };
        if (Array.isArray(topic.children) && topic.children.length > 0) {
          merged.children = mergeRecursively(
            topic.children,
            chapterId,
            chapterName,
          );
        }
        return merged;
      });

    if (isProgressLoading) {
      const fallbackGroups = sourceTopicsTree.map((group) => ({
        ...group,
        topics: mergeRecursively(
          group.topics || [],
          group.sectionName,
          group.chapterName,
        ),
      }));
      setChapterGroups(fallbackGroups);
      return;
    }

    const mergedGroups = sourceTopicsTree.map((group) => ({
      ...group,
      topics: mergeRecursively(
        group.topics || [],
        group.sectionName,
        group.chapterName,
      ),
    }));
    setChapterGroups(mergedGroups);
  }, [userProgress, sourceTopicsTree, isProgressLoading]);

  useEffect(() => {
    lastCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [tutorHistory, isMentorTyping]);

  useEffect(() => {
      const handleKeyDown = (event) => {
        // Check if the sidebar is closed (i.e., we are in focus mode) and Escape is pressed
        if (!isSidebarOpen && event.key === 'Escape') {
          setIsSidebarOpen(true);
        }
      };

      // Add event listener when the component mounts
      window.addEventListener('keydown', handleKeyDown);

      // Cleanup: remove event listener when the component unmounts to prevent memory leaks
      return () => {
        window.removeEventListener('keydown', handleKeyDown);
      };
    }, [isSidebarOpen]);
    
  const callTutorApi = useCallback(async (body) => {
    if (!auth.currentUser) throw new Error("User not authenticated.");
    const token = await auth.currentUser.getIdToken();
    const stepEndpoint = API_BASE ? `${API_BASE}/tutor/step` : '/tutor/step';
      const response = await fetch(stepEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'API request failed.');
    }
    return response.json();
  }, []);
  
  const handleTopicClick = useCallback(async (topic) => {
    // Parent categories are not lessons, so just let the sidebar expand/collapse.
    if (topic.children && topic.children.length > 0) {
      return; 
    }
    
    if (activeTopic?.id === topic.id) return;

    setIsMentorTyping(true);
    setTutorHistory([]);
    setActiveTopic(topic);

    try {
      if (!auth.currentUser) throw new Error("User not logged in.");
      const token = await auth.currentUser.getIdToken();

      const messagesEndpoint = API_BASE ? `${API_BASE}/tutor/messages/${topic.id}` : `/tutor/messages/${topic.id}`;
      const messagesResponse = await fetch(messagesEndpoint, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!messagesResponse.ok) throw new Error('Failed to fetch message history.');
      const historyData = await messagesResponse.json();
      
      const transformedHistory = historyData.messages.map(msg => {
          if (msg.role === 'assistant' && msg.ui) return msg.ui;
          if (msg.role === 'user' && msg.userInput) {
              if (typeof msg.userInput === 'object' && msg.userInput !== null) return null; 
              return { type: 'USER_MESSAGE', message: msg.userInput };
          }
          return null;
      }).filter(Boolean);

      // NEW LOGIC: If history exists, just show it. Otherwise, start a new session.
      if (transformedHistory.length > 0) {
        setTutorHistory(transformedHistory);
      } else {
        const startSessionData = await callTutorApi({
          topicId: topic.id,
          organ: topic.chapterId,
          userName: userName,
        });
        setTutorHistory([startSessionData.ui]); 
      }
    
    } catch (err) {
      console.error("Error starting/resuming session:", err);
      setTutorHistory([{ type: 'ERROR', message: "Could not load the lesson. Please try again." }]);
    } finally {
      setIsMentorTyping(false);
    }
  }, [activeTopic, userName, callTutorApi]);

  const submitTutorInteraction = useCallback(async (userInput, displayMessage) => {
    if (isMentorTyping || !activeTopic) return;
    setIsMentorTyping(true);
    if (displayMessage) {
      setTutorHistory(prev => [...prev, { type: 'USER_MESSAGE', message: displayMessage }]);
    }
    try {
      const data = await callTutorApi({
        userInput: userInput,
        topicId: activeTopic.id,
        organ: activeTopic.chapterId,
      });
      setTutorHistory(prev => [...prev, data.ui]);
    } catch (error) {
      console.error("Error submitting user input:", error);
      setTutorHistory(prev => [...prev, { type: 'ERROR', message: "Sorry, I'm having trouble connecting." }]);
    } finally {
      setIsMentorTyping(false);
    }
  }, [isMentorTyping, activeTopic, callTutorApi]);
  
  const handleChatInputSubmit = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    submitTutorInteraction(chatInput, chatInput);
    setChatInput('');
  };

  const handleCheckpointSubmit = (selectedIndex) => {
    const lastCard = tutorHistory[tutorHistory.length - 1];
    const choiceText = lastCard?.options[selectedIndex] || `Answer #${selectedIndex + 1}`;
    submitTutorInteraction({ selectedIndex }, `My answer: "${choiceText}"`);
  };



  const handleContinue = () => {
    // We send "continue" to the backend, but `null` for the display message
    // so it doesn't appear in the chat.
    submitTutorInteraction("continue", null);
  };

  const handleContinueToNextTopic = () => {
    // 1. Create a flat list of all learnable topics (those without children)
    const flatTopics = [];
    const flattenRecursively = (topics) => {
        topics.forEach(topic => {
            if (!topic.children || topic.children.length === 0) {
                flatTopics.push(topic);
            }
            if (topic.children && topic.children.length > 0) {
                flattenRecursively(topic.children);
            }
        });
    };
    chapterGroups.forEach((group) => flattenRecursively(group.topics || []));

    // 2. Find the index of the current topic
    const currentIndex = flatTopics.findIndex(topic => topic.id === activeTopic.id);

    // 3. If there is a next topic, click it
    if (currentIndex !== -1 && currentIndex < flatTopics.length - 1) {
        const nextTopic = flatTopics[currentIndex + 1];
        handleTopicClick(nextTopic);
    } else {
        // Optional: Handle the case where the last topic in the chapter is finished
        // You could add a UI card here to celebrate completing the chapter
    }
  };

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);
  
  const renderTutorCard = (card, index) => {
    if (!card) return null;
    const isLastCard = index === tutorHistory.length - 1;
    const baseCardClass =
      "rounded-3xl border border-slate-100 bg-white/90 shadow-xl shadow-slate-900/5 overflow-hidden backdrop-blur";
    const primaryButtonClass =
      "inline-flex items-center justify-center rounded-full border border-indigo-200 bg-indigo-600 px-6 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-indigo-500 hover:shadow-lg disabled:translate-y-0 disabled:bg-indigo-300";
    const neutralButtonClass =
      "inline-flex items-center justify-center rounded-full border border-slate-300 bg-slate-900 px-6 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-800 hover:shadow-lg disabled:translate-y-0 disabled:bg-slate-500";
    const successButtonClass =
      "inline-flex items-center justify-center rounded-full border border-emerald-200 bg-emerald-600 px-6 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-emerald-500 hover:shadow-lg disabled:translate-y-0 disabled:bg-emerald-300";
    const renderHeader = (title, tone) => (
      <div className={`px-6 py-5 sm:px-8 sm:py-6 ${tone}`}>
        <h3 className="text-2xl font-semibold text-white sm:text-3xl">{title}</h3>
      </div>
    );
    const renderChatInput = () => (
      <div className="mt-6 rounded-2xl border border-indigo-100 bg-white/80 p-4 shadow-sm shadow-indigo-200/60">
        <form onSubmit={handleChatInputSubmit}>
          <fieldset disabled={isMentorTyping} className="space-y-3">
            <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
              Your Response
            </label>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Type your answer..."
                className="flex-1 rounded-xl border border-indigo-100 bg-white/90 px-4 py-2 text-sm text-slate-800 shadow-inner focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
              <button type="submit" className={primaryButtonClass}>
                Send
              </button>
            </div>
          </fieldset>
        </form>
      </div>
    );
    const shouldShowInput =
      isLastCard && ["TEACH_CARD", "SHORT_CHECKPOINT"].includes(card.type);

    switch (card.type) {
      case "OBJECTIVES_CARD":
        return (
          <div
            key={index}
            className={`${baseCardClass} border-indigo-100 shadow-indigo-200/50`}
          >
            {renderHeader(
              card.title,
              "bg-gradient-to-r from-indigo-500 via-sky-500 to-blue-500"
            )}
            <div className="px-6 py-6 sm:px-8 sm:py-8">
              <div className="prose prose-lg max-w-none text-slate-800">
                <ReactMarkdown>{card.message}</ReactMarkdown>
              </div>
              {isLastCard ? (
                <div className="mt-6 flex justify-end">
                  <button
                    onClick={handleContinue}
                    disabled={isMentorTyping}
                    className={primaryButtonClass}
                  >
                    Ready
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        );
      case "TEACH_CARD":
        return (
          <div key={index} className={baseCardClass}>
            {renderHeader(
              card.title,
              "bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900"
            )}
            <div className="px-6 py-6 sm:px-8 sm:py-8">
              <div className="prose prose-lg max-w-none text-slate-800">
                <ReactMarkdown>{card.message}</ReactMarkdown>
              </div>
              {(card.assets?.images?.length > 0 ||
                card.assets?.cases?.length > 0) && (
                <div className="mt-6 rounded-2xl border border-slate-200/70 bg-slate-50/80 p-4">
                  <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
                    Reference material
                  </h4>
                  <div className="mt-3 space-y-2 text-sm font-semibold text-indigo-600">
                    {(card.assets.images || []).map((img) => (
                      <a
                        key={img.alt}
                        href={img.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block transition hover:text-indigo-500"
                      >
                        {img.alt}
                      </a>
                    ))}
                    {(card.assets.cases || []).map((c) => (
                      <a
                        key={c.label}
                        href={c.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block transition hover:text-indigo-500"
                      >
                        {c.label}
                      </a>
                    ))}
                  </div>
                </div>
              )}
              {shouldShowInput ? renderChatInput() : null}
            </div>
          </div>
        );
      case "TRANSITION_CARD":
        return (
          <div
            key={index}
            className={`${baseCardClass} border-sky-100 shadow-sky-200/50`}
          >
            {renderHeader(
              card.title,
              "bg-gradient-to-r from-sky-500 via-indigo-500 to-blue-600"
            )}
            <div className="px-6 py-6 sm:px-8 sm:py-8">
              <div className="prose prose-lg max-w-none text-slate-800">
                <ReactMarkdown>{card.message}</ReactMarkdown>
              </div>
              <div className="mt-6 flex justify-end">
                <button
                  onClick={handleContinue}
                  disabled={isMentorTyping}
                  className={primaryButtonClass}
                >
                  Continue to Checkpoint →
                </button>
              </div>
            </div>
          </div>
        );
      case "MCQ_CHECKPOINT":
        return (
          <div
            key={index}
            className={`${baseCardClass} border-slate-200 shadow-slate-900/10`}
          >
            {renderHeader(
              card.title,
              "bg-gradient-to-r from-slate-900 via-slate-800 to-slate-700"
            )}
            <div className="px-6 py-6 sm:px-8 sm:py-8">
              <MCQForm
                question={card.message}
                options={card.options}
                onSubmit={handleCheckpointSubmit}
                isMentorTyping={isMentorTyping}
              />
            </div>
          </div>
        );
      case "SHORT_CHECKPOINT":
        return (
          <div
            key={index}
            className={`${baseCardClass} border-slate-200 shadow-slate-900/10`}
          >
            {renderHeader(
              card.title,
              "bg-gradient-to-r from-slate-900 via-slate-800 to-slate-700"
            )}
            <div className="px-6 py-6 sm:px-8 sm:py-8">
              <div className="prose prose-lg max-w-none text-slate-800">
                <ReactMarkdown>{card.message}</ReactMarkdown>
              </div>
              {shouldShowInput ? renderChatInput() : null}
            </div>
          </div>
        );
      case "FEEDBACK_CARD": {
        const isCorrect = card.isCorrect;
        const tone = isCorrect
          ? "bg-gradient-to-r from-emerald-500 via-emerald-500 to-emerald-600"
          : "bg-gradient-to-r from-rose-500 via-amber-500 to-orange-500";
        const borderTone = isCorrect ? "border-emerald-100" : "border-rose-100";
        return (
          <div
            key={index}
            className={`${baseCardClass} ${borderTone} shadow-emerald-200/50`}
          >
            {renderHeader(card.title, tone)}
            <div className="px-6 py-6 sm:px-8 sm:py-8">
              <div className="prose prose-lg max-w-none text-slate-800">
                <ReactMarkdown>{card.message}</ReactMarkdown>
              </div>
              <div className="mt-6 flex justify-end">
                <button
                  onClick={handleContinue}
                  disabled={isMentorTyping}
                  className={neutralButtonClass}
                >
                  Continue →
                </button>
              </div>
            </div>
          </div>
        );
      }
      case "SUMMARY_CARD":
      case "TOPIC_COMPLETE":
        return (
          <div
            key={index}
            className={`${baseCardClass} border-amber-100 shadow-amber-200/60`}
          >
            {renderHeader(
              card.title,
              "bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500"
            )}
            <div className="px-6 py-6 sm:px-8 sm:py-8">
              <div className="prose prose-lg max-w-none text-slate-800">
                <ReactMarkdown>{card.message}</ReactMarkdown>
              </div>
              {card.isTopicComplete && isLastCard ? (
                <div className="mt-6 flex justify-end">
                <button
                  onClick={handleContinueToNextTopic}
                  disabled={isMentorTyping}
                  className={successButtonClass}
                >
                  Continue to Next Topic →
                </button>
                </div>
              ) : null}
            </div>
          </div>
        );
      case "USER_MESSAGE":
        return (
          <div key={index} className="flex justify-end">
            <div className="max-w-2xl rounded-2xl border border-indigo-200 bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow shadow-indigo-200/60">
              {card.message}
            </div>
          </div>
        );
      case "ERROR":
        return (
          <div key={index} className="flex justify-start">
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 shadow-sm shadow-rose-200/60">
              {card.message}
            </div>
          </div>
        );
      default:
        return (
          <div key={index} className="text-sm text-slate-400">
            Received an unknown card type: {card.type}
          </div>
        );
    }
  };

  const primaryChapter = scheduledChapters[0] || null;
  const hasMultipleChapters = scheduledChapters.length > 1;
  const hasScheduledChapters = scheduledChapters.length > 0;
  const sidebarTitle = hasMultipleChapters
    ? "Today's Chapters"
    : primaryChapter?.sectionName || (hasScheduledChapters ? "Syllabus" : "Planner");
  const sidebarSubtitle = hasMultipleChapters
    ? `${scheduledChapters.length} chapters scheduled`
    : hasScheduledChapters
      ? primaryChapter?.chapterName || "Chapter"
      : "No chapters scheduled";
  const badgeLabel =
    activeTopic?.chapterName ||
    primaryChapter?.chapterName ||
    (hasMultipleChapters ? "Multiple Chapters" : null);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-emerald-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 lg:flex-row">
        <aside
          className={`relative flex-shrink-0 overflow-hidden transition-all duration-300 ease-in-out ${isSidebarOpen ? "w-full max-w-sm lg:max-w-xs xl:max-w-sm" : "w-0"}`}
        >
          <div
            className={`flex h-full min-h-[640px] flex-col rounded-3xl border border-indigo-100 bg-white/95 shadow-2xl shadow-indigo-200/50 backdrop-blur transition-all duration-300 ${isSidebarOpen ? "translate-x-0 opacity-100" : "pointer-events-none -translate-x-6 opacity-0"}`}
          >
            <div className="border-b border-indigo-100 px-6 py-6 sm:px-7">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-indigo-600">
                {sidebarTitle}
              </p>
              <h2 className="mt-2 text-lg font-semibold text-slate-900">
                {sidebarSubtitle}
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Navigate topics and subtopics for today's study plan.
              </p>
            </div>
            <nav className="flex-1 overflow-y-auto px-6 py-5 timeline-scrollbar">
              {isSidebarLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, idx) => (
                    <div
                      key={idx}
                      className="h-12 animate-pulse rounded-2xl border border-indigo-50 bg-indigo-50/60 shadow-inner shadow-indigo-100/40"
                    />
                  ))}
                </div>
              ) : chapterGroups.length > 0 ? (
                <div className="space-y-6">
                  {chapterGroups.map((group) => (
                    <div key={group.key} className="space-y-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-indigo-500">
                          {group.sectionName || "Syllabus"}
                        </p>
                        <h3 className="text-sm font-semibold text-slate-800">
                          {group.chapterName || "Chapter"}
                        </h3>
                      </div>
                      <ul className="space-y-2">
                        {(group.topics || []).map((topic) => (
                          <TopicNode
                            key={`${group.key || "group"}-${topic.id}`}
                            topic={topic}
                            onTopicSelect={handleTopicClick}
                            currentTopicId={activeTopic ? activeTopic.id : null}
                          />
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-indigo-200 bg-white/70 px-4 py-6 text-center text-sm text-slate-500 shadow-inner shadow-indigo-100/40">
                  No topics available for today&apos;s plan yet.
                </div>
              )}
            </nav>
          </div>
        </aside>
        <main className="flex-1">
          <div className="relative flex h-full min-h-[640px] flex-col overflow-hidden rounded-3xl border border-indigo-100 bg-white/90 shadow-2xl shadow-indigo-200/40 backdrop-blur">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-indigo-50/55 via-white/70 to-transparent" />
            <div className="relative flex h-full flex-col">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-indigo-100 px-6 py-6 sm:px-8 sm:py-7">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-indigo-600">
                    Learning workspace
                  </p>
                  <h1 className="mt-2 text-2xl font-semibold text-slate-900 sm:text-3xl">
                    {activeTopic ? activeTopic.name : "Select a topic to begin"}
                  </h1>
                  <p className="mt-2 text-sm text-slate-500">
                    {activeTopic
                      ? "Follow the guided flow, answer checkpoints, or ask the mentor for clarification."
                      : "Choose a topic from the syllabus to launch an interactive lesson with the mentor."}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {badgeLabel ? (
                    <span className="inline-flex items-center rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-600">
                      {badgeLabel}
                    </span>
                  ) : null}
                  {isSidebarOpen ? (
                    <button
                      onClick={toggleSidebar}
                      className="inline-flex items-center justify-center rounded-full border border-indigo-200 bg-white/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-indigo-600 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:bg-indigo-50 hover:shadow-lg"
                    >
                      Focus Mode
                    </button>
                  ) : (
                    <button
                      onClick={toggleSidebar}
                      className="inline-flex items-center justify-center rounded-full border border-indigo-200 bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-indigo-500 hover:shadow-lg"
                    >
                      Show Menu
                    </button>
                  )}
                </div>
              </div>
              <div className="flex-1 space-y-6 overflow-y-auto px-6 pb-8 pt-6 timeline-scrollbar sm:px-8 sm:pb-10 sm:pt-8">
                {tutorHistory.length > 0 ? (
                  tutorHistory.map((card, index) => (
                    <div
                      key={index}
                      ref={index === tutorHistory.length - 1 ? lastCardRef : null}
                    >
                      {renderTutorCard(card, index)}
                    </div>
                  ))
                ) : (
                  <div className="rounded-3xl border border-dashed border-indigo-200 bg-white/70 px-6 py-12 text-center shadow-inner shadow-indigo-100/40">
                    <h2 className="text-2xl font-semibold text-slate-800">
                      Welcome to the Learn Workspace
                    </h2>
                    <p className="mt-3 text-sm text-slate-500">
                      Select a topic from the syllabus to unlock tailored mentor
                      guidance, checkpoints, and study assets.
                    </p>
                  </div>
                )}
                {isMentorTyping && (
                  <div className="flex justify-start">
                    <div className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-white/90 px-4 py-2 text-xs font-medium text-slate-600 shadow-sm shadow-indigo-100/50">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-indigo-400 [animation-delay:-0.4s]" />
                      <span className="h-2 w-2 animate-pulse rounded-full bg-indigo-400 [animation-delay:-0.2s]" />
                      <span className="h-2 w-2 animate-pulse rounded-full bg-indigo-400" />
                      <span>Mentor is typing</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default LearnTab;
