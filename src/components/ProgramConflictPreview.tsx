import type { Programme } from '../lib/api';
import { faNumber } from '../lib/format';
import type { WorkoutTemplate } from '../types';

export function CoachProgramConflictPreview({ program }: { program: Programme | null }) {
  if (!program) return <p className="account-muted">برنامه‌ای فعال نیست.</p>;
  return <div className="conflict-preview-plan">
    <p><strong>{program.title}</strong> · {(program.priceTomans ?? 0) > 0 ? `${faNumber(program.priceTomans!)} تومان` : 'رایگان'}</p>
    {program.days.map((day, index) => <div key={index}><strong>{day.name}</strong>
      <ul className="conflict-preview-list">{day.exercises.map((item, itemIndex) => <li key={itemIndex}>{item.name} · {faNumber(item.sets)} ست · {item.reps} تکرار · {faNumber(item.restSeconds)} ثانیه استراحت</li>)}</ul>
    </div>)}
  </div>;
}

export function PersonalProgramConflictPreview({ program }: { program: WorkoutTemplate[] }) {
  if (!program.length) return <p className="account-muted">برنامه‌ای ثبت نشده است.</p>;
  return <div className="conflict-preview-plan">{program.map((day) => <div key={day.id}>
    <strong>{day.name}</strong> <span className="account-muted">· {day.focus}</span>
    <ul className="conflict-preview-list">{day.exercises.map((item, index) => <li key={index}>{item.name} · {faNumber(item.prescription.sets)} ست · {faNumber(item.prescription.minReps)}–{faNumber(item.prescription.maxReps)} تکرار</li>)}</ul>
  </div>)}</div>;
}
