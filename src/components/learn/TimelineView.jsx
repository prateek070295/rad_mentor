import React from 'react';
import {
  formatDuration,
  formatRelativeDuration,
  formatSnakeCaseLabel,
  describeTimelineEvent,
  truncateSummary,
  SESSION_TIMELINE_LIMIT,
} from './helpers';

/**
 * Renders session timing insights (summary + timeline) for the Socratic tutor.
 */
const TimelineView = ({
  isFinalCard,
  isAdmin,
  showSessionInsights,
  isLoading,
  error,
  sessionStats,
  sessionStatsAutoRetryExceeded,
  onRefresh,
  activeTopicId,
}) => {
  if (!isFinalCard) return null;
  if (!isAdmin || !showSessionInsights) return null;

  if (isLoading) {
    return (
      <div className="mt-8 rounded-3xl border border-indigo-100 bg-white/70 px-5 py-4 text-sm text-slate-600 shadow-inner shadow-indigo-100/40">
        Gathering session timing insights.
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-8 rounded-3xl border border-rose-100 bg-rose-50/80 px-5 py-4 text-sm text-rose-600 shadow-inner shadow-rose-100/40">
        {String(error)}
      </div>
    );
  }

  if (!sessionStats || sessionStats.topicId !== activeTopicId) {
    return null;
  }

  const { aggregates = {}, events = [] } = sessionStats;
  const summaryItems = [
    {
      label: 'Learner active time',
      value: formatDuration(aggregates.totalUserThinkMs),
    },
    {
      label: 'Mentor response time',
      value: formatDuration(aggregates.totalAiResponseMs),
    },
    {
      label: 'Avg learner response',
      value:
        aggregates.averageUserThinkMs != null
          ? formatDuration(aggregates.averageUserThinkMs)
          : '--:--',
    },
    {
      label: 'Avg mentor response',
      value:
        aggregates.averageAiResponseMs != null
          ? formatDuration(aggregates.averageAiResponseMs)
          : '--:--',
    },
    {
      label: 'Session length',
      value: formatDuration(aggregates.sessionDurationMs),
    },
    {
      label: 'Interactions',
      value: `${aggregates.userResponseCount || 0} learner ↔ ${
        aggregates.aiResponseCount || 0
      } mentor`,
    },
  ];

  const limitedEvents = events.slice(0, SESSION_TIMELINE_LIMIT);
  const showMoreNotice = events.length > limitedEvents.length;

  return (
    <div className="mt-8 rounded-3xl border border-indigo-100 bg-white/80 p-6 shadow-inner shadow-indigo-100/40">
      <h3 className="text-xs font-semibold uppercase tracking-[0.3em] text-indigo-500">
        Session Timing Insights
      </h3>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        {summaryItems.map((item) => (
          <div
            key={item.label}
            className="rounded-2xl border border-slate-200/60 bg-white/80 px-4 py-3 shadow-sm shadow-slate-100/40"
          >
            <dt className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              {item.label}
            </dt>
            <dd className="mt-1 text-base font-semibold text-slate-900">
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-6">
        <h4 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
          Timeline
        </h4>
        {limitedEvents.length > 0 ? (
          <ol className="mt-3 space-y-3">
            {limitedEvents.map((event) => {
              const description =
                event.type === 'USER_RESPONSE'
                  ? truncateSummary(event.userInputSummary)
                  : event.type === 'AI_RESPONSE'
                  ? formatSnakeCaseLabel(event.uiType)
                  : null;
              return (
                <li
                  key={event.id}
                  className="rounded-2xl border border-slate-200/60 bg-white px-4 py-3 shadow-sm shadow-slate-100/40"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-semibold text-slate-700">
                      {describeTimelineEvent(event)}
                    </span>
                    <span className="text-xs font-semibold text-indigo-500">
                      {formatRelativeDuration(event.relativeMs)}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                    {Number.isFinite(event.durationMs) ? (
                      <span>Duration {formatDuration(event.durationMs)}</span>
                    ) : null}
                    {event.phaseAfter ? (
                      <span>Phase {formatSnakeCaseLabel(event.phaseAfter)}</span>
                    ) : null}
                  </div>
                  {description ? (
                    <p className="mt-2 text-xs text-slate-500">
                      {event.type === 'AI_RESPONSE'
                        ? `Mentor card: ${description}`
                        : description}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="mt-3 text-xs text-slate-500">
            Timing events will appear here once the mentor exchange begins.
          </p>
        )}
        {showMoreNotice ? (
          <p className="mt-3 text-[11px] text-slate-400">
            Showing the first {limitedEvents.length} of {events.length} events.
          </p>
        ) : null}
        {sessionStats.pending ? (
          <div className="mt-4 text-xs text-slate-500">
            <p>Timing data is still publishing—check back in a few seconds.</p>
            {sessionStatsAutoRetryExceeded ? (
              <button
                type="button"
                onClick={onRefresh}
                className="mt-4 inline-flex items-center rounded-full border border-indigo-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:bg-indigo-50"
              >
                Refresh Timing Data
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default TimelineView;
