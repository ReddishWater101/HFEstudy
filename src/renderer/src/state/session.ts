export type ModeAssignment = Record<string, Mode>;

export type Phase =
  | { kind: 'welcome' }
  | { kind: 'intro'; index: number }
  | { kind: 'flashcards-a' }
  | { kind: 'snake' }
  | { kind: 'flashcards-b' }
  | { kind: 'quiz' }
  | { kind: 'end' };

export type SessionState = {
  phase: Phase;
  participantId: string | null;
  intake: IntakeData | null;
  people: Person[];
  modeAssignment: ModeAssignment;
  memoryPhrases: Record<string, string>;
};

export type Action =
  | { type: 'startSession'; participantId: string; intake: IntakeData }
  | { type: 'advancePhase' }
  | { type: 'setIntroIndex'; index: number }
  | { type: 'setMemoryPhrase'; personId: string; phrase: string }
  | { type: 'setPeople'; people: Person[] }
  | { type: 'setModeAssignment'; modeAssignment: ModeAssignment }
  | { type: 'setParticipantId'; participantId: string };

export const initialState: SessionState = {
  phase: { kind: 'welcome' },
  participantId: null,
  intake: null,
  people: [],
  modeAssignment: {},
  memoryPhrases: {},
};

function nextPhase(phase: Phase): Phase {
  switch (phase.kind) {
    case 'welcome':
      return { kind: 'intro', index: 0 };
    case 'intro':
      return { kind: 'flashcards-a' };
    case 'flashcards-a':
      return { kind: 'snake' };
    case 'snake':
      return { kind: 'flashcards-b' };
    case 'flashcards-b':
      return { kind: 'quiz' };
    case 'quiz':
      return { kind: 'end' };
    case 'end':
      return phase;
  }
}

export function sessionReducer(state: SessionState, action: Action): SessionState {
  switch (action.type) {
    case 'startSession':
      return {
        ...state,
        participantId: action.participantId,
        intake: action.intake,
      };
    case 'advancePhase':
      return { ...state, phase: nextPhase(state.phase) };
    case 'setIntroIndex':
      if (state.phase.kind !== 'intro') return state;
      return { ...state, phase: { kind: 'intro', index: action.index } };
    case 'setMemoryPhrase':
      return {
        ...state,
        memoryPhrases: { ...state.memoryPhrases, [action.personId]: action.phrase },
      };
    case 'setPeople':
      return { ...state, people: action.people };
    case 'setModeAssignment':
      return { ...state, modeAssignment: action.modeAssignment };
    case 'setParticipantId':
      return { ...state, participantId: action.participantId };
  }
}
