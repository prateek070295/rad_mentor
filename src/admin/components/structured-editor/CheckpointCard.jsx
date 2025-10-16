// file: src/admin/components/structured-editor/CheckpointCard.jsx
import React, { useMemo } from 'react';
import { BLOOM_LEVELS, DEFAULT_BLOOM_LEVEL, EditorActionTypes } from './state';

const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

const CheckpointCard = ({
  sectionId,
  checkpoint,
  index,
  totalCount,
  dispatch,
}) => {
  const checkpointId = checkpoint.localId || checkpoint.id;
  const isMcq = checkpoint.type === 'mcq';
  const options = useMemo(
    () => (isMcq ? checkpoint.options || [] : []),
    [isMcq, checkpoint.options],
  );
  const hints = useMemo(() => checkpoint.hints || [], [checkpoint.hints]);
  const patterns = useMemo(() => checkpoint.answer_patterns || [], [checkpoint.answer_patterns]);

  const updateCheckpoint = (changes) => {
    dispatch({
      type: EditorActionTypes.UPDATE_SECTION_ITEM,
      payload: {
        sectionId,
        itemType: 'checkpoints',
        itemId: checkpointId,
        changes,
      },
    });
  };

  const handleTypeChange = (nextType) => {
    if (nextType === checkpoint.type) return;
    if (nextType === 'short') {
      updateCheckpoint({
        type: 'short',
        options: [],
        correct_index: 0,
        answer_patterns: patterns.length ? patterns : [''],
      });
    } else {
      const ensuredOptions = options.length
        ? options.slice(0, 5)
        : ['', '', '', ''];
      while (ensuredOptions.length < 4) {
        ensuredOptions.push('');
      }
      updateCheckpoint({
        type: 'mcq',
        options: ensuredOptions,
        correct_index: clamp(checkpoint.correct_index || 0, 0, ensuredOptions.length - 1),
      });
    }
  };

  const handleMove = (direction) => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= totalCount) return;
    dispatch({
      type: EditorActionTypes.REORDER_SECTION_ITEM,
      payload: {
        sectionId,
        itemType: 'checkpoints',
        fromIndex: index,
        toIndex: targetIndex,
      },
    });
  };

  const handleRemove = () => {
    dispatch({
      type: EditorActionTypes.REMOVE_SECTION_ITEM,
      payload: {
        sectionId,
        itemType: 'checkpoints',
        itemId: checkpointId,
      },
    });
  };

  const handleOptionChange = (optionIndex, value) => {
    const nextOptions = options.slice();
    nextOptions[optionIndex] = value;
    const changes = { options: nextOptions };
    if (checkpoint.correct_index >= nextOptions.length) {
      changes.correct_index = Math.max(0, nextOptions.length - 1);
    }
    updateCheckpoint(changes);
  };

  const handleAddOption = () => {
    if (!isMcq || options.length >= 5) return;
    updateCheckpoint({ options: [...options, ''] });
  };

  const handleRemoveOption = (optionIndex) => {
    if (!isMcq || options.length <= 4) return;
    const nextOptions = options.filter((_, idx) => idx !== optionIndex);
    const changes = { options: nextOptions };
    if (checkpoint.correct_index >= nextOptions.length) {
      changes.correct_index = Math.max(0, nextOptions.length - 1);
    }
    updateCheckpoint(changes);
  };

  const handleHintChange = (hintIndex, value) => {
    const nextHints = hints.slice();
    nextHints[hintIndex] = value;
    updateCheckpoint({ hints: nextHints });
  };

  const handleAddHint = () => {
    if (hints.length >= 3) return;
    updateCheckpoint({ hints: [...hints, ''] });
  };

  const handleRemoveHint = (hintIndex) => {
    const nextHints = hints.filter((_, idx) => idx !== hintIndex);
    updateCheckpoint({ hints: nextHints });
  };

  const handlePatternChange = (patternIndex, value) => {
    const nextPatterns = patterns.slice();
    nextPatterns[patternIndex] = value;
    updateCheckpoint({ answer_patterns: nextPatterns });
  };

  const handleAddPattern = () => {
    if (patterns.length >= 10) return;
    updateCheckpoint({ answer_patterns: [...patterns, ''] });
  };

  const handleRemovePattern = (patternIndex) => {
    const nextPatterns = patterns.filter((_, idx) => idx !== patternIndex);
    updateCheckpoint({ answer_patterns: nextPatterns });
  };

  const issues = useMemo(() => {
    const messages = [];
    if (!checkpoint.question_md || checkpoint.question_md.trim().length < 10) {
      messages.push('Write a clear question (10+ chars).');
    }
    if (!checkpoint.rationale_md || checkpoint.rationale_md.trim().length < 10) {
      messages.push('Add a brief rationale so learners understand the answer.');
    }
    if (isMcq) {
      if (options.length < 4) {
        messages.push('Provide at least 4 options.');
      }
      const emptyOptions = options.filter((option) => !option || !option.trim());
      if (emptyOptions.length) {
        messages.push('Fill in every answer option.');
      }
    } else {
      if (!patterns.length) {
        messages.push('Add at least one acceptable answer pattern.');
      }
      const emptyPatterns = patterns.filter((pattern) => !pattern || !pattern.trim());
      if (emptyPatterns.length) {
        messages.push('Complete every answer pattern or remove the extras.');
      }
    }
    const emptyHints = hints.filter((hint) => !hint || !hint.trim());
    if (emptyHints.length) {
      messages.push('Each hint should contain actionable guidance.');
    }
    return messages;
  }, [checkpoint, hints, isMcq, options, patterns]);

  return (
    <article className="space-y-4 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-lg shadow-slate-100/60">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold uppercase tracking-wide text-indigo-600">
            #{index + 1}
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
              Checkpoint
            </p>
            {issues.length === 0 ? (
              <p className="text-[11px] font-medium text-emerald-600">Looks good</p>
            ) : (
              <ul className="mt-1 list-disc pl-5 text-[11px] text-amber-600">
                {issues.map((issue, idx) => (
                  <li key={`${checkpointId}-issue-${idx}`}>{issue}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleMove('up')}
            disabled={index === 0}
            className="inline-flex items-center rounded-full border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Move up
          </button>
          <button
            type="button"
            onClick={() => handleMove('down')}
            disabled={index === totalCount - 1}
            className="inline-flex items-center rounded-full border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Move down
          </button>
          <button
            type="button"
            onClick={handleRemove}
            className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-600 transition hover:border-rose-300 hover:bg-rose-100"
          >
            Remove
          </button>
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
          Type
          <select
            value={checkpoint.type}
            onChange={(event) => handleTypeChange(event.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 shadow-inner focus:border-indigo-400 focus:outline-none focus:ring"
          >
            <option value="mcq">Multiple choice</option>
            <option value="short">Short answer</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
          Bloom level
          <select
            value={checkpoint.bloom_level || DEFAULT_BLOOM_LEVEL}
            onChange={(event) =>
              updateCheckpoint({ bloom_level: event.target.value })
            }
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 shadow-inner focus:border-indigo-400 focus:outline-none focus:ring"
          >
            {BLOOM_LEVELS.map((level) => (
              <option key={level} value={level}>
                {level.charAt(0).toUpperCase() + level.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
          Figure ID (optional)
          <input
            type="text"
            value={checkpoint.figure_id || ''}
            onChange={(event) => updateCheckpoint({ figure_id: event.target.value })}
            placeholder="FIG-01"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 shadow-inner focus:border-indigo-400 focus:outline-none focus:ring"
          />
        </label>
      </div>

      <label className="flex flex-col gap-2 text-xs font-semibold text-slate-600">
        Question prompt
        <textarea
          value={checkpoint.question_md || ''}
          onChange={(event) => updateCheckpoint({ question_md: event.target.value })}
          rows={3}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 shadow-inner focus:border-indigo-400 focus:outline-none focus:ring"
          placeholder="Write the learner-facing question in markdown."
        />
      </label>

      {isMcq ? (
        <section className="space-y-3 rounded-xl border border-indigo-100 bg-indigo-50/70 p-3">
          <header className="flex items-center justify-between">
            <h5 className="text-xs font-semibold uppercase tracking-[0.25em] text-indigo-600">
              Answer options
            </h5>
            <button
              type="button"
              onClick={handleAddOption}
              disabled={options.length >= 5}
              className="inline-flex items-center rounded-full border border-indigo-200 bg-white px-2 py-1 text-xs font-semibold text-indigo-600 transition hover:border-indigo-300 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Add option
            </button>
          </header>
          <ul className="space-y-2">
            {options.map((option, optionIndex) => (
              <li
                key={`${checkpointId}-option-${optionIndex}`}
                className="flex flex-wrap items-start gap-2 rounded-lg border border-indigo-100 bg-white px-3 py-2"
              >
                <span className="mt-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-[11px] font-semibold text-indigo-600">
                  {optionIndex + 1}
                </span>
                <div className="flex-1">
                  <input
                    type="text"
                    value={option}
                    onChange={(event) => handleOptionChange(optionIndex, event.target.value)}
                    placeholder="Answer option"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 shadow-inner focus:border-indigo-400 focus:outline-none focus:ring"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 text-xs font-semibold text-indigo-600">
                    <input
                      type="radio"
                      name={`${checkpointId}-correct`}
                      checked={checkpoint.correct_index === optionIndex}
                      onChange={() => updateCheckpoint({ correct_index: optionIndex })}
                    />
                    Correct
                  </label>
                  <button
                    type="button"
                    onClick={() => handleRemoveOption(optionIndex)}
                    disabled={options.length <= 4}
                    className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-600 transition hover:border-rose-300 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section className="space-y-3 rounded-xl border border-emerald-100 bg-emerald-50/70 p-3">
          <header className="flex items-center justify-between">
            <h5 className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-600">
              Acceptable answers
            </h5>
            <button
              type="button"
              onClick={handleAddPattern}
              disabled={patterns.length >= 10}
              className="inline-flex items-center rounded-full border border-emerald-200 bg-white px-2 py-1 text-xs font-semibold text-emerald-600 transition hover:border-emerald-300 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Add pattern
            </button>
          </header>
          <ul className="space-y-2">
            {patterns.map((pattern, patternIndex) => (
              <li
                key={`${checkpointId}-pattern-${patternIndex}`}
                className="flex items-start gap-2 rounded-lg border border-emerald-100 bg-white px-3 py-2"
              >
                <span className="mt-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-[11px] font-semibold text-emerald-600">
                  {patternIndex + 1}
                </span>
                <div className="flex-1">
                  <input
                    type="text"
                    value={pattern}
                    onChange={(event) => handlePatternChange(patternIndex, event.target.value)}
                    placeholder="Regex, keyword, or exemplar response"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 shadow-inner focus:border-emerald-400 focus:outline-none focus:ring"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleRemovePattern(patternIndex)}
                  className="mt-1 inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-600 transition hover:border-rose-300 hover:bg-rose-100"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <label className="flex flex-col gap-2 text-xs font-semibold text-slate-600">
        Rationale / Explanation
        <textarea
          value={checkpoint.rationale_md || ''}
          onChange={(event) => updateCheckpoint({ rationale_md: event.target.value })}
          rows={3}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 shadow-inner focus:border-indigo-400 focus:outline-none focus:ring"
          placeholder="What makes the answer correct? Give learners a high-yield nugget."
        />
      </label>

      <section className="space-y-3 rounded-xl border border-amber-100 bg-amber-50/60 p-3">
        <header className="flex items-center justify-between">
          <h5 className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-600">
            Hints ({hints.length}/3)
          </h5>
          <button
            type="button"
            onClick={handleAddHint}
            disabled={hints.length >= 3}
            className="inline-flex items-center rounded-full border border-amber-200 bg-white px-2 py-1 text-xs font-semibold text-amber-600 transition hover:border-amber-300 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add hint
          </button>
        </header>
        {hints.length === 0 ? (
          <p className="rounded-lg border border-dashed border-amber-200 bg-white px-3 py-2 text-sm text-amber-700">
            No hints added yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {hints.map((hint, hintIndex) => (
              <li
                key={`${checkpointId}-hint-${hintIndex}`}
                className="flex items-start gap-2 rounded-lg border border-amber-100 bg-white px-3 py-2"
              >
                <span className="mt-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-[11px] font-semibold text-amber-600">
                  {hintIndex + 1}
                </span>
                <div className="flex-1">
                  <input
                    type="text"
                    value={hint}
                    onChange={(event) => handleHintChange(hintIndex, event.target.value)}
                    placeholder="Scaffold the learner toward the answer"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 shadow-inner focus:border-amber-400 focus:outline-none focus:ring"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveHint(hintIndex)}
                  className="mt-1 inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-600 transition hover:border-rose-300 hover:bg-rose-100"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  );
};

export default CheckpointCard;
