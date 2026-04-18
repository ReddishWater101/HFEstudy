import { useState } from 'react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useDispatch } from '../state/SessionProvider';

const AGE_OPTIONS = ['Under 18', '18-20', '21-23', '24-26', '27+', 'Prefer not to say'];
const GENDER_OPTIONS = ['Female', 'Male', 'Non-binary', 'Prefer not to say'];
const ACADEMIC_OPTIONS = ['Freshman', 'Sophomore', 'Junior', 'Senior', 'Graduate Student', 'Other'];
const FIELD_OPTIONS = ['Engineering', 'Business', 'Health Sciences', 'Liberal Arts', 'Pre Law', 'Other'];
const EVENT_FREQ_OPTIONS = ['Daily', 'Weekly', 'Monthly', 'Quarterly', 'Yearly', 'Never'];
const ABILITY_OPTIONS = ['Very Poor', 'Poor', 'Average', 'Good', 'Excellent'];
const STRATEGY_OPTIONS = [
  'Repetition (saying the name multiple times)',
  'Associating with a feature (e.g., "Sarah with glasses")',
  'Creating memory phrase or cue "Ben likes playing basketball"',
  'Writing it down',
  'No strategy',
  'Other',
];
const LEARNING_STYLE_OPTIONS = [
  'Visual (seeing information)',
  'Auditory (hearing information)',
  'Combination of both',
  'Not sure',
  'Other',
];
const MOBILE_FREQ_OPTIONS = ['Never', 'Rarely', 'Sometimes', 'Often', 'Very Often'];
const YES_NO_OPTIONS = ['Yes', 'No'];
const YES_NO_OTHER_OPTIONS = ['Yes', 'No', 'Other'];

export function SurveyPhase() {
  const dispatch = useDispatch();
  const [submitting, setSubmitting] = useState(false);

  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [academic, setAcademic] = useState('');
  const [academicOther, setAcademicOther] = useState('');
  const [field, setField] = useState('');
  const [fieldOther, setFieldOther] = useState('');
  const [eventFreq, setEventFreq] = useState('');
  const [ability, setAbility] = useState('');
  const [strategies, setStrategies] = useState<string[]>([]);
  const [strategiesOther, setStrategiesOther] = useState('');
  const [learningStyle, setLearningStyle] = useState('');
  const [learningStyleOther, setLearningStyleOther] = useState('');
  const [mobileFreq, setMobileFreq] = useState('');
  const [usedMemoryApp, setUsedMemoryApp] = useState('');
  const [vision, setVision] = useState('');
  const [visionOther, setVisionOther] = useState('');
  const [hearing, setHearing] = useState('');
  const [hearingOther, setHearingOther] = useState('');
  const [fatigue, setFatigue] = useState('');

  const valid =
    age !== '' &&
    gender !== '' &&
    academic !== '' &&
    (academic !== 'Other' || academicOther.trim() !== '') &&
    field !== '' &&
    (field !== 'Other' || fieldOther.trim() !== '') &&
    eventFreq !== '' &&
    ability !== '' &&
    strategies.length > 0 &&
    (!strategies.includes('Other') || strategiesOther.trim() !== '') &&
    learningStyle !== '' &&
    (learningStyle !== 'Other' || learningStyleOther.trim() !== '') &&
    mobileFreq !== '' &&
    usedMemoryApp !== '' &&
    vision !== '' &&
    (vision !== 'Other' || visionOther.trim() !== '') &&
    hearing !== '' &&
    (hearing !== 'Other' || hearingOther.trim() !== '') &&
    fatigue.trim() !== '';

  function pickRadio(
    setter: (v: string) => void,
    otherSetter: (v: string) => void,
    next: string,
  ) {
    setter(next);
    if (next !== 'Other') otherSetter('');
  }

  function toggleStrategy(val: string, checked: boolean) {
    setStrategies((prev) => {
      if (checked) return prev.includes(val) ? prev : [...prev, val];
      return prev.filter((s) => s !== val);
    });
    if (val === 'Other' && !checked) setStrategiesOther('');
  }

  function withOther(value: string, otherText: string): string {
    return value === 'Other' ? `Other: ${otherText.trim()}` : value;
  }

  async function handleSubmit() {
    if (!valid || submitting) return;
    setSubmitting(true);

    const strategiesFinal = strategies.map((s) =>
      s === 'Other' ? `Other: ${strategiesOther.trim()}` : s,
    );

    const answers: SurveyAnswers = {
      age,
      gender,
      academicStatus: withOther(academic, academicOther),
      fieldOfStudy: withOther(field, fieldOther),
      eventFrequency: eventFreq,
      nameRecallAbility: ability,
      strategies: strategiesFinal,
      learningStyle: withOther(learningStyle, learningStyleOther),
      mobileAppFrequency: mobileFreq,
      usedMemoryApp,
      visionImpairment: withOther(vision, visionOther),
      hearingImpairment: withOther(hearing, hearingOther),
      fatigueNotes: fatigue.trim(),
    };

    try {
      await window.api.logEvent({
        type: 'survey.submit',
        t: Date.now(),
        answers,
      });
      dispatch({ type: 'advancePhase' });
    } catch (err) {
      console.error('survey.submit failed:', err);
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-full w-full overflow-y-auto bg-white text-neutral-900">
      <div className="mx-auto w-full max-w-[560px] px-12 py-16">
        <div className="flex flex-col gap-14">
          <div className="flex flex-col gap-3">
            <h1 className="font-display text-4xl leading-tight text-neutral-900">
              Demographic Information
            </h1>
            <p className="text-sm text-neutral-500">
              This information will be used only for research analysis and will remain
              confidential.
            </p>
          </div>

          <div className="flex flex-col gap-12">
            <RadioQuestion
              name="age"
              number={1}
              label="Age"
              options={AGE_OPTIONS}
              value={age}
              onChange={setAge}
            />

            <RadioQuestion
              name="gender"
              number={2}
              label="Gender Identity"
              options={GENDER_OPTIONS}
              value={gender}
              onChange={setGender}
            />

            <RadioQuestion
              name="academic"
              number={3}
              label="Academic Status"
              options={ACADEMIC_OPTIONS}
              value={academic}
              onChange={(v) => pickRadio(setAcademic, setAcademicOther, v)}
              otherValue={academicOther}
              onOtherChange={setAcademicOther}
            />

            <RadioQuestion
              name="field"
              number={4}
              label="Field of Study"
              options={FIELD_OPTIONS}
              value={field}
              onChange={(v) => pickRadio(setField, setFieldOther, v)}
              otherValue={fieldOther}
              onOtherChange={setFieldOther}
            />

            <RadioQuestion
              name="eventFreq"
              number={5}
              label="How often do you attend networking or social events where you meet new people?"
              options={EVENT_FREQ_OPTIONS}
              value={eventFreq}
              onChange={setEventFreq}
            />

            <RadioQuestion
              name="ability"
              number={6}
              label="How would you rate your ability to remember names?"
              options={ABILITY_OPTIONS}
              value={ability}
              onChange={setAbility}
            />

            <CheckboxQuestion
              number={7}
              label="Do you typically use any strategies to remember names?"
              hint="Select all that apply"
              options={STRATEGY_OPTIONS}
              values={strategies}
              onToggle={toggleStrategy}
              otherValue={strategiesOther}
              onOtherChange={setStrategiesOther}
            />

            <RadioQuestion
              name="learningStyle"
              number={8}
              label="Which learning style do you feel works best for you?"
              options={LEARNING_STYLE_OPTIONS}
              value={learningStyle}
              onChange={(v) => pickRadio(setLearningStyle, setLearningStyleOther, v)}
              otherValue={learningStyleOther}
              onOtherChange={setLearningStyleOther}
            />

            <RadioQuestion
              name="mobileFreq"
              number={9}
              label="How frequently do you use mobile apps for learning or productivity?"
              options={MOBILE_FREQ_OPTIONS}
              value={mobileFreq}
              onChange={setMobileFreq}
            />

            <RadioQuestion
              name="usedMemoryApp"
              number={10}
              label="Have you ever used a memory-support or learning app before?"
              options={YES_NO_OPTIONS}
              value={usedMemoryApp}
              onChange={setUsedMemoryApp}
            />

            <RadioQuestion
              name="vision"
              number={11}
              label="Do you have any vision impairments (corrected or uncorrected) that may affect your ability to see visual content?"
              options={YES_NO_OTHER_OPTIONS}
              value={vision}
              onChange={(v) => pickRadio(setVision, setVisionOther, v)}
              otherValue={visionOther}
              onOtherChange={setVisionOther}
            />

            <RadioQuestion
              name="hearing"
              number={12}
              label="Do you have any hearing impairments that may affect your ability to hear audio content?"
              options={YES_NO_OTHER_OPTIONS}
              value={hearing}
              onChange={(v) => pickRadio(setHearing, setHearingOther, v)}
              otherValue={hearingOther}
              onOtherChange={setHearingOther}
            />

            <div className="flex flex-col gap-4">
              <QuestionHeader
                number={13}
                label="Is there anything that may affect your ability to complete this task (e.g., fatigue, distractions)?"
              />
              <Input
                id="fatigue"
                type="text"
                value={fatigue}
                onChange={(e) => setFatigue(e.target.value)}
                placeholder="Enter your answer"
                aria-label="Is there anything that may affect your ability to complete this task (e.g., fatigue, distractions)?"
              />
            </div>
          </div>

          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={!valid || submitting}
            className="self-start"
          >
            {submitting ? 'Submitting...' : 'Submit \u2192'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function QuestionHeader({ number, label, hint }: { number: number; label: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-xs uppercase tracking-widest text-neutral-400">
        Question {number}
      </div>
      <div className="text-base text-neutral-900">{label}</div>
      {hint ? <div className="text-xs text-neutral-400">{hint}</div> : null}
    </div>
  );
}

type RadioQuestionProps = {
  name: string;
  number: number;
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
  otherValue?: string;
  onOtherChange?: (v: string) => void;
};

function RadioQuestion({
  name,
  number,
  label,
  options,
  value,
  onChange,
  otherValue,
  onOtherChange,
}: RadioQuestionProps) {
  const showOther = value === 'Other' && onOtherChange !== undefined;

  return (
    <div className="flex flex-col gap-4">
      <QuestionHeader number={number} label={label} />
      <div className="flex flex-col gap-2">
        {options.map((opt) => {
          const id = `${name}-${opt}`;
          const checked = value === opt;
          return (
            <label
              key={opt}
              htmlFor={id}
              className="flex cursor-pointer items-center gap-3 text-sm text-neutral-900"
            >
              <input
                id={id}
                type="radio"
                name={name}
                value={opt}
                checked={checked}
                onChange={() => onChange(opt)}
                className="h-4 w-4 shrink-0 accent-neutral-900"
              />
              <span>{opt}</span>
            </label>
          );
        })}
      </div>
      {showOther ? (
        <Input
          type="text"
          value={otherValue ?? ''}
          onChange={(e) => onOtherChange?.(e.target.value)}
          placeholder="Please specify"
          aria-label={`${label} — other`}
        />
      ) : null}
    </div>
  );
}

type CheckboxQuestionProps = {
  number: number;
  label: string;
  hint?: string;
  options: string[];
  values: string[];
  onToggle: (val: string, checked: boolean) => void;
  otherValue: string;
  onOtherChange: (v: string) => void;
};

function CheckboxQuestion({
  number,
  label,
  hint,
  options,
  values,
  onToggle,
  otherValue,
  onOtherChange,
}: CheckboxQuestionProps) {
  const showOther = values.includes('Other');

  return (
    <div className="flex flex-col gap-4">
      <QuestionHeader number={number} label={label} hint={hint} />
      <div className="flex flex-col gap-2">
        {options.map((opt) => {
          const id = `strategy-${opt}`;
          const checked = values.includes(opt);
          return (
            <label
              key={opt}
              htmlFor={id}
              className="flex cursor-pointer items-center gap-3 text-sm text-neutral-900"
            >
              <input
                id={id}
                type="checkbox"
                value={opt}
                checked={checked}
                onChange={(e) => onToggle(opt, e.target.checked)}
                className="h-4 w-4 shrink-0 accent-neutral-900"
              />
              <span>{opt}</span>
            </label>
          );
        })}
      </div>
      {showOther ? (
        <Input
          type="text"
          value={otherValue}
          onChange={(e) => onOtherChange(e.target.value)}
          placeholder="Please specify"
          aria-label={`${label} — other`}
        />
      ) : null}
    </div>
  );
}
