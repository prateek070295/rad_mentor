export const SESSION_TIMELINE_LIMIT = 12;
export const MAX_SESSION_STATS_RETRIES = 5;

export const formatSnakeCaseLabel = (value) => {
  if (!value) return "";
  return value
    .split("_")
    .filter(Boolean)
    .map(
      (part) =>
        part.charAt(0).toUpperCase() + part.slice(1).toLowerCase(),
    )
    .join(" ");
};

export const formatDuration = (ms) => {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 1) return "<1s";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (!hours && (seconds || parts.length === 0)) {
    parts.push(`${seconds}s`);
  }
  return parts.join(" ");
};

export const formatRelativeDuration = (ms) => {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  if (ms === 0) return "0s";
  return `+${formatDuration(ms)}`;
};

export const describeTimelineEvent = (event) => {
  if (!event || !event.type) {
    return "Timeline event";
  }
  switch (event.type) {
    case "SESSION_START":
      return "Session started";
    case "USER_RESPONSE": {
      switch (event.userInputType) {
        case "CHECKPOINT_SELECTION":
          return "You answered a checkpoint";
        case "CONTINUE":
          return "You continued to the next step";
        case "TEXT":
          return "You responded";
        case "OBJECT":
          return "You submitted a response";
        default:
          return "You responded";
      }
    }
    case "AI_RESPONSE": {
      const label = formatSnakeCaseLabel(event.uiType) || "Response";
      return `Mentor delivered ${label.toLowerCase()}`;
    }
    default:
      return formatSnakeCaseLabel(event.type) || "Timeline event";
  }
};

export const truncateSummary = (text, maxLength = 160) => {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
};

export async function runTasksWithConcurrency(factories = [], limit = 5) {
  if (!Array.isArray(factories) || factories.length === 0) {
    return [];
  }
  const max = Math.max(1, Math.min(Number(limit) || 1, factories.length));
  const results = new Array(factories.length);
  let nextIndex = 0;

  const runNext = async () => {
    const current = nextIndex;
    nextIndex += 1;
    if (current >= factories.length) {
      return;
    }
    const factory = factories[current];
    if (typeof factory !== "function") {
      results[current] = { status: "fulfilled", value: null };
      await runNext();
      return;
    }
    try {
      const value = await factory();
      results[current] = { status: "fulfilled", value };
    } catch (error) {
      results[current] = { status: "rejected", reason: error };
    }
    await runNext();
  };

  const workers = Array.from({ length: max }, () => runNext());
  await Promise.all(workers);
  return results;
}
