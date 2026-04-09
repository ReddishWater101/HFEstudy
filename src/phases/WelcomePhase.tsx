import { useState } from 'react';
import * as audio from '../lib/audio';
import { assignModes } from '../lib/randomization';
import { useDispatch } from '../state/SessionProvider';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Label } from '../components/ui/Label';
import { Gear } from '../components/ui/Gear';
import { Layout } from '../components/Layout';
import { ProctorPasswordModal } from '../components/ProctorPasswordModal';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type StudyFileState =
  | { kind: 'none' }
  | { kind: 'loaded'; filePath: string; config: StudyConfig; resolvedPeople: Person[] }
  | { kind: 'error'; message: string };

export function WelcomePhase() {
  const dispatch = useDispatch();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [studyFile, setStudyFile] = useState<StudyFileState>({ kind: 'none' });
  const [studyFileLoading, setStudyFileLoading] = useState(false);
  const [proctorOpen, setProctorOpen] = useState(false);

  const valid =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    EMAIL_RE.test(email.trim()) &&
    studyFile.kind === 'loaded';

  async function handleLoadStudyFile() {
    setStudyFileLoading(true);
    try {
      const result = await window.api.showStudyFileOpenDialog();
      if (!result) {
        return;
      }
      setStudyFile({
        kind: 'loaded',
        filePath: result.filePath,
        config: result.config,
        resolvedPeople: result.resolvedPeople,
      });
    } catch (err) {
      if (studyFile.kind !== 'loaded') {
        setStudyFile({
          kind: 'error',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    } finally {
      setStudyFileLoading(false);
    }
  }

  async function handleBegin() {
    if (!valid || submitting || studyFile.kind !== 'loaded') return;
    setSubmitting(true);
    audio.init();

    const intake: IntakeData = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
    };
    const selectedPeople = studyFile.resolvedPeople;
    const modeAssignment = assignModes(selectedPeople, studyFile.config.enabledModes);

    try {
      const { participantId } = await window.api.startSession(intake);
      await window.api.logEvent({
        type: 'session.start',
        t: Date.now(),
        participantId,
        intake,
        modeAssignment,
        people: selectedPeople.map((p) => ({ id: p.id, firstName: p.firstName })),
        studyConfigId: studyFile.config.id,
        blockCount: studyFile.config.flashcardBlockCount,
        enabledModes: studyFile.config.enabledModes,
      });

      void audio.preload(selectedPeople.map((p) => p.audioUrl));

      dispatch({ type: 'setPeople', people: selectedPeople });
      dispatch({ type: 'setModeAssignment', modeAssignment });
      dispatch({ type: 'setStudyConfig', studyConfig: studyFile.config });
      dispatch({ type: 'startSession', participantId, intake });
      dispatch({ type: 'advancePhase' });
    } catch (err) {
      console.error('startSession failed:', err);
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setProctorOpen(true)}
        aria-label="Proctor settings"
        className="fixed right-6 top-6 z-10 flex h-10 w-10 items-center justify-center text-neutral-300 transition-colors hover:text-neutral-900"
      >
        <Gear />
      </button>

      <Layout>
        <div className="flex flex-col gap-16 py-24">
          <div className="flex flex-col gap-3">
            <h1 className="font-display text-5xl leading-none text-neutral-900">
              HFE Name Recall Study
            </h1>
            <p className="text-sm text-neutral-500">
              A short session on how we remember faces and names.
            </p>
          </div>

          <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-2">
              <Label htmlFor="firstName">First name</Label>
              <Input
                id="firstName"
                type="text"
                autoComplete="given-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                autoFocus
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="lastName">Last name</Label>
              <Input
                id="lastName"
                type="text"
                autoComplete="family-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <StudyFileField state={studyFile} loading={studyFileLoading} onLoad={handleLoadStudyFile} />
          </div>

          <Button
            variant="primary"
            onClick={handleBegin}
            disabled={!valid || submitting}
            className="self-start"
          >
            {submitting ? 'Starting...' : 'Begin study \u2192'}
          </Button>
        </div>
      </Layout>

      <ProctorPasswordModal
        open={proctorOpen}
        onCancel={() => setProctorOpen(false)}
        onSuccess={() => {
          setProctorOpen(false);
          dispatch({ type: 'setPhase', phase: { kind: 'proctor-builder' } });
        }}
      />
    </>
  );
}

function StudyFileField({
  state,
  loading,
  onLoad,
}: {
  state: StudyFileState;
  loading: boolean;
  onLoad: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label>Study file</Label>
      <div className="flex flex-col gap-2 pt-1">
        <Button variant="default" onClick={onLoad} className="self-start py-1 text-sm">
          {loading ? 'Loading...' : 'Load study file \u2192'}
        </Button>

        {state.kind === 'loaded' ? (
          <div className="text-sm text-neutral-900">{state.filePath}</div>
        ) : null}

        {state.kind === 'error' ? (
          <p className="text-sm text-red-600" role="alert">
            {state.message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
