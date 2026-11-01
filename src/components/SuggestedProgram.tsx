import { useMemo, useState } from 'react';
import { Check, Sparkles, Wand2 } from 'lucide-react';
import { saveProgram } from '../lib/programPersistence';
import { useProgram } from '../lib/programStore';
import {
  defaultSuggestionAnswers,
  suggestionQuestions,
  suggestProgram,
  type SuggestionAnswers,
} from '../lib/suggestedProgram';
import { faNumber } from '../lib/format';

/**
 * The programme we suggest to a student who trains on their own.
 *
 * Five questions, one answer: a programme that fits the days, the level, the equipment
 * and the joints the student wants to protect.
 */
export function SuggestedProgram() {
  const currentProgram = useProgram();
  const [answers, setAnswers] = useState<SuggestionAnswers>(defaultSuggestionAnswers);
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const suggestion = useMemo(() => suggestProgram(answers), [answers]);

  function answer(key: keyof SuggestionAnswers, value: SuggestionAnswers[keyof SuggestionAnswers]) {
    setAnswers((current) => ({ ...current, [key]: value }) as SuggestionAnswers);
    setApplied(false);
    setError(null);
  }

  async function apply() {
    setBusy(true);
    setError(null);
    try {
      await saveProgram(suggestion.days, currentProgram);
      setApplied(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'برنامه فعال نشد.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="suggested-program">
      <div className="suggested-program__questions">
        {suggestionQuestions.map((question) => (
          <fieldset key={question.id} className="suggested-program__question">
            <legend>{question.title}</legend>
            <div className="suggested-program__options">
              {question.options.map((option) => {
                const selected = answers[question.id] === option.value;
                return (
                  <button
                    key={String(option.value)}
                    type="button"
                    className={`suggested-program__option ${selected ? 'is-selected' : ''}`}
                    aria-pressed={selected}
                    onClick={() => answer(question.id, option.value)}
                  >
                    {selected && <Check size={14} />}
                    {option.label}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>

      <section className="suggested-program__result" aria-label="برنامهٔ پیشنهادی">
        <header className="suggested-program__head">
          <div>
            <span className="eyebrow">پیشنهاد میتی</span>
            <h3><Wand2 size={17} /> {suggestion.title}</h3>
          </div>
          <span className="suggested-program__meta">{faNumber(suggestion.days.length)} روز در هفته</span>
        </header>

        <ul className="suggested-program__reasons">
          {suggestion.reasons.map((reason) => <li key={reason}>{reason}</li>)}
        </ul>
        {suggestion.warnings.length > 0 && (
          <ul className="suggested-program__warnings">
            {suggestion.warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        )}

        <ol className="suggested-program__days">
          {suggestion.days.map((day) => (
            <li key={day.id}>
              <div className="suggested-program__day-head">
                <strong>{day.name}</strong>
                <span>{day.focus} · حدود {faNumber(day.durationMinutes)} دقیقه</span>
              </div>
              <ul className="suggested-program__exercises">
                {day.exercises.map((exercise) => (
                  <li key={`${day.id}-${exercise.exerciseId}`}>
                    <span>{exercise.name}</span>
                    <span className="suggested-program__dose">
                      {faNumber(exercise.prescription.sets)} ست × {faNumber(exercise.prescription.minReps)}–{faNumber(exercise.prescription.maxReps)} تکرار · استراحت {faNumber(exercise.prescription.restSeconds)} ثانیه
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>

        <div className="suggested-program__actions">
          <button type="button" className="button button--primary" disabled={busy} onClick={() => void apply()}>
            <Sparkles size={16} /> {busy ? 'در حال فعال‌سازی…' : 'این برنامه را فعال کن'}
          </button>
          {applied && <p className="form-success" role="status">برنامهٔ پیشنهادی فعال شد. از صفحهٔ برنامه می‌توانید آن را ببینید.</p>}
          {error && <p className="form-error" role="alert">{error}</p>}
        </div>
      </section>
    </div>
  );
}
