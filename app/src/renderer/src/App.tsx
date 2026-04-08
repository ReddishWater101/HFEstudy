import { SessionProvider, useSession } from './state/SessionProvider';
import { WelcomePhase } from './phases/WelcomePhase';
import { IntroVideoPhase } from './phases/IntroVideoPhase';
import { FlashcardPhase } from './phases/FlashcardPhase';
import { SnakePhase } from './phases/SnakePhase';
import { QuizPhase } from './phases/QuizPhase';
import { EndPhase } from './phases/EndPhase';

function PhaseSwitcher() {
  const { phase } = useSession();

  if (phase.kind === 'welcome') return <WelcomePhase />;
  if (phase.kind === 'intro') return <IntroVideoPhase />;
  if (phase.kind === 'flashcards-a') return <FlashcardPhase key="A" sessionLabel="A" />;
  if (phase.kind === 'snake') return <SnakePhase />;
  if (phase.kind === 'flashcards-b') return <FlashcardPhase key="B" sessionLabel="B" />;
  if (phase.kind === 'quiz') return <QuizPhase />;
  if (phase.kind === 'end') return <EndPhase />;

  return null;
}

export default function App() {
  return (
    <SessionProvider>
      <PhaseSwitcher />
    </SessionProvider>
  );
}
