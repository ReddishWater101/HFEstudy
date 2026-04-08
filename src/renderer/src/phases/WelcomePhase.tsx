import { useState } from 'react';
import * as audio from '../lib/audio';
import { assignModes } from '../lib/randomization';
import { useDispatch } from '../state/SessionProvider';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Label } from '../components/ui/Label';
import { Layout } from '../components/Layout';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function WelcomePhase() {
  const dispatch = useDispatch();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const valid =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    EMAIL_RE.test(email.trim());

  async function handleBegin() {
    if (!valid || submitting) return;
    setSubmitting(true);

    audio.init();

    const intake: IntakeData = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
    };

    try {
      const allPeople = await window.api.getPeople();
      const config = await window.api.getConfig();
      const modeAssignment = assignModes(allPeople, config.numberOfPeople);

      const selectedPeople = allPeople.filter((p) => modeAssignment[p.id] !== undefined);

      const { participantId } = await window.api.startSession(intake);

      await window.api.logEvent({
        type: 'session.start',
        t: Date.now(),
        participantId,
        intake,
        modeAssignment,
        people: selectedPeople.map((p) => ({ id: p.id, firstName: p.firstName })),
      });

      void audio.preload(selectedPeople.map((p) => p.audioUrl));

      dispatch({ type: 'setPeople', people: selectedPeople });
      dispatch({ type: 'setModeAssignment', modeAssignment });
      dispatch({ type: 'startSession', participantId, intake });
      dispatch({ type: 'advancePhase' });
    } catch (err) {
      console.error('startSession failed:', err);
      setSubmitting(false);
    }
  }

  return (
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
        </div>

        <Button
          variant="primary"
          onClick={handleBegin}
          disabled={!valid || submitting}
          className="self-start"
        >
          {submitting ? 'Starting…' : 'Begin study →'}
        </Button>
      </div>
    </Layout>
  );
}
