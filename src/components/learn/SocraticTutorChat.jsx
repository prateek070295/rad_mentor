import React from 'react';
import ReactMarkdown from 'react-markdown';
import MCQForm from '../MCQForm';
import StructuredTable from '../StructuredTable';
import TimelineView from './TimelineView';

/**
 * Renders the interactive Socratic tutor conversation and controls.
 */
const SocraticTutorChat = ({
  tutorHistory,
  isMentorTyping,
  chatInput,
  onChatInputChange,
  onChatSubmit,
  onCheckpointSubmit,
  onContinue,
  onContinueToNextTopic,
  onSessionInsightsToggle,
  showSessionInsights,
  isAdmin,
  sessionTimeline,
  handleErrorRetry,
  lastCardRef,
  activeTopic,
}) => {
  const {
    sessionStats,
    sessionStatsError,
    isSessionStatsLoading,
    sessionStatsAutoRetryExceeded,
    handleSessionStatsRefresh,
  } = sessionTimeline;

  const baseCardClass =
    'mt-6 overflow-hidden rounded-3xl border border-indigo-100 bg-white shadow-2xl shadow-indigo-200/40';
  const primaryButtonClass =
    'inline-flex items-center justify-center rounded-full border border-indigo-200 bg-indigo-600 px-6 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-indigo-500 hover:shadow-lg disabled:translate-y-0 disabled:bg-indigo-300';
  const neutralButtonClass =
    'inline-flex items-center justify-center rounded-full border border-slate-300 bg-slate-900 px-6 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-800 hover:shadow-lg disabled:translate-y-0 disabled:bg-slate-500';
  const successButtonClass =
    'inline-flex items-center justify-center rounded-full border border-emerald-200 bg-emerald-600 px-6 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-emerald-500 hover:shadow-lg disabled:translate-y-0 disabled:bg-emerald-300';

  const renderHeader = (title, tone) => (
    <div className={`px-6 py-5 sm:px-8 sm:py-6 ${tone}`}>
      <h3 className="text-2xl font-semibold text-white sm:text-3xl">{title}</h3>
    </div>
  );

  const renderChatInput = () => (
    <div className="mt-6 rounded-2xl border border-indigo-100 bg-white/80 p-4 shadow-sm shadow-indigo-200/60">
      <form onSubmit={onChatSubmit}>
        <fieldset disabled={isMentorTyping} className="space-y-3">
          <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
            Your Response
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              value={chatInput}
              onChange={onChatInputChange}
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

  const renderTutorCard = (card, index) => {
    const isLastCard = index === tutorHistory.length - 1;
    const isFinalCard = isLastCard && card.type === 'SUMMARY_CARD';
    const shouldShowInput =
      isLastCard && ['TEACH_CARD', 'SHORT_CHECKPOINT'].includes(card.type);
    const shouldShowReadyButton =
      isLastCard && card.type === 'OBJECTIVES_CARD';

    switch (card.type) {
      case 'OBJECTIVES_CARD':
        const hasObjectivesArray =
          Array.isArray(card.objectives) && card.objectives.length > 0;
        const objectivesList = hasObjectivesArray
          ? card.objectives
          : null;
        const objectivesMessage = !objectivesList?.length
          ? card.message || card.content || ''
          : '';
        return (
          <div
            key={index}
            className={`${baseCardClass} border-indigo-100 shadow-indigo-200/50`}
          >
            {renderHeader(
              card.title,
              'bg-gradient-to-r from-indigo-500 via-sky-500 to-blue-500',
            )}
            <div className="px-6 py-6 sm:px-8 sm:py-8">
              {objectivesList?.length ? (
                <ul className="space-y-2 text-sm text-slate-700">
                  {objectivesList.map((objective, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-indigo-500" />
                      <span>{objective}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {objectivesMessage ? (
                <div className="prose prose-sm mt-4 max-w-none text-slate-700">
                  <ReactMarkdown>{objectivesMessage}</ReactMarkdown>
                </div>
              ) : null}
              {shouldShowReadyButton ? (
                <div className="mt-6 flex justify-end">
                  <button
                    type="button"
                    onClick={onContinue}
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
      case 'TEACH_CARD':
        return (
          <div key={index} className={baseCardClass}>
            {renderHeader(
              card.title,
              'bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900',
            )}
            <div className="px-6 py-6 sm:px-8 sm:py-8">
              <div className="prose prose-lg max-w-none text-slate-800">
                <ReactMarkdown>{card.message}</ReactMarkdown>
              </div>
              {Array.isArray(card.tables) && card.tables.length > 0 ? (
                <div className="mt-6 space-y-4">
                  {card.tables.map((table) => (
                    <StructuredTable key={table.table_id || table.caption} table={table} />
                  ))}
                </div>
              ) : null}
              {shouldShowInput ? renderChatInput() : null}
            </div>
          </div>
        );
      case 'TRANSITION_CARD':
        return (
          <div
            key={index}
            className={`${baseCardClass} border-sky-100 shadow-sky-200/50`}
          >
            {renderHeader(
              card.title,
              'bg-gradient-to-r from-sky-500 via-indigo-500 to-blue-600',
            )}
            <div className="px-6 py-6 sm:px-8 sm:py-8">
              <div className="prose prose-lg max-w-none text-slate-800">
                <ReactMarkdown>{card.message}</ReactMarkdown>
              </div>
              <div className="mt-6 flex justify-end">
                <button
                  onClick={onContinue}
                  disabled={isMentorTyping}
                  className={primaryButtonClass}
                >
                  Continue to Checkpoint <span aria-hidden="true">{'\u2192'}</span>
                </button>
              </div>
            </div>
          </div>
        );
      case 'MCQ_CHECKPOINT':
        return (
          <div
            key={index}
            className={`${baseCardClass} border-slate-200 shadow-slate-900/10`}
          >
            {renderHeader(
              card.title,
              'bg-gradient-to-r from-slate-900 via-slate-800 to-slate-700',
            )}
            <div className="px-6 py-6 sm:px-8 sm:py-8">
              <MCQForm
                question={card.message}
                options={card.options}
                disabled={isMentorTyping}
                onSubmit={onCheckpointSubmit}
              />
            </div>
          </div>
        );
      case 'SHORT_CHECKPOINT':
        return (
          <div
            key={index}
            className={`${baseCardClass} border-slate-200 shadow-slate-900/10`}
          >
            {renderHeader(
              card.title,
              'bg-gradient-to-r from-slate-900 via-slate-800 to-slate-700',
            )}
            <div className="px-6 py-6 sm:px-8 sm:py-8">
              <div className="prose prose-lg max-w-none text-slate-800">
                <ReactMarkdown>{card.message}</ReactMarkdown>
              </div>
              <div className="mt-6 rounded-2xl border border-indigo-100 bg-white/80 p-4 shadow-sm shadow-indigo-200/60">
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!chatInput.trim()) return;
                    onChatSubmit(event);
                  }}
                >
                  <fieldset disabled={isMentorTyping} className="space-y-3">
                    <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                      Your Answer
                    </label>
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <input
                        type="text"
                        value={chatInput}
                        onChange={onChatInputChange}
                        placeholder="Type your answer..."
                        className="flex-1 rounded-xl border border-indigo-100 bg-white/90 px-4 py-2 text-sm text-slate-800 shadow-inner focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                      />
                      <button type="submit" className={primaryButtonClass}>
                        Submit
                      </button>
                    </div>
                  </fieldset>
                </form>
              </div>
            </div>
          </div>
        );
      case 'FEEDBACK_CARD': {
        const isCorrect = card.isCorrect;
        const tone = isCorrect
          ? 'bg-gradient-to-r from-emerald-500 via-emerald-500 to-emerald-600'
          : 'bg-gradient-to-r from-rose-500 via-amber-500 to-orange-500';
        const borderTone = isCorrect ? 'border-emerald-100' : 'border-rose-100';
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
                  onClick={onContinue}
                  disabled={isMentorTyping}
                  className={neutralButtonClass}
                >
                  Continue
                </button>
              </div>
            </div>
          </div>
        );
      }
      case 'SUMMARY_CARD':
      case 'TOPIC_COMPLETE':
        return (
          <div
            key={index}
            className={`${baseCardClass} border-amber-100 shadow-amber-200/60`}
          >
            {renderHeader(
              card.title,
              'bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500',
            )}
            <div className="px-6 py-6 sm:px-8 sm:py-8">
              <div className="prose prose-lg max-w-none text-slate-800">
                <ReactMarkdown>{card.message}</ReactMarkdown>
              </div>
              {card.type === 'SUMMARY_CARD' ? (
                <TimelineView
                  isFinalCard={isFinalCard}
                  isAdmin={isAdmin}
                  showSessionInsights={showSessionInsights}
                  isLoading={isSessionStatsLoading}
                  error={sessionStatsError}
                  sessionStats={sessionStats}
                  sessionStatsAutoRetryExceeded={sessionStatsAutoRetryExceeded}
                  onRefresh={handleSessionStatsRefresh}
                  activeTopicId={activeTopic?.id || null}
                />
              ) : null}
              {(isAdmin || (card.isTopicComplete && isLastCard)) ? (
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  {isAdmin ? (
                    <button
                      type="button"
                      onClick={onSessionInsightsToggle}
                      className="inline-flex items-center rounded-full border border-indigo-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:bg-indigo-50"
                    >
                      {showSessionInsights ? 'Hide Timing Insights' : 'Show Timing Insights'}
                    </button>
                  ) : null}
                  {card.isTopicComplete && isLastCard ? (
                    <button
                      onClick={onContinueToNextTopic}
                      disabled={isMentorTyping}
                      className={`${successButtonClass} ml-auto`}
                    >
                      Continue to Next Topic <span aria-hidden="true">{'\u2192'}</span>
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        );
      case 'USER_MESSAGE':
        return (
          <div key={index} className="flex justify-end">
            <div className="max-w-2xl rounded-2xl border border-indigo-200 bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow shadow-indigo-200/60">
              {card.message}
            </div>
          </div>
        );
      case 'ERROR':
        return (
          <div key={index} className="flex justify-start">
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 shadow-sm shadow-rose-200/60">
              <div>{card.message}</div>
              {card.retryPayload ? (
                <button
                  type="button"
                  onClick={() => handleErrorRetry(card.retryPayload)}
                  disabled={isMentorTyping}
                  className="mt-3 inline-flex items-center rounded-full border border-rose-200 bg-white px-3 py-1 text-xs font-semibold text-rose-600 transition hover:border-rose-300 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Retry
                </button>
              ) : null}
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

  return (
    <div className="flex-1 space-y-6 overflow-y-auto px-6 pb-8 pt-6 timeline-scrollbar sm:px-8 sm:pb-10 sm:pt-8">
      {tutorHistory.length > 0 ? (
        tutorHistory.map((card, index) => (
          <div key={index} ref={index === tutorHistory.length - 1 ? lastCardRef : null}>
            {renderTutorCard(card, index)}
          </div>
        ))
      ) : (
        <div className="rounded-3xl border border-dashed border-indigo-200 bg-white/70 px-6 py-12 text-center shadow-inner shadow-indigo-100/40">
          <h2 className="text-2xl font-semibold text-slate-800">Welcome to the Learn Workspace</h2>
          <p className="mt-3 text-sm text-slate-500">
            Select a topic from the syllabus to unlock tailored mentor guidance, checkpoints, and study
            assets.
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
  );
};

export default SocraticTutorChat;
