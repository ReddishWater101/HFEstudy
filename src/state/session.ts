export type ModeAssignment = Record<string, Mode>;

export type Phase =
  | { kind: 'welcome' }
  | { kind: 'proctor-builder' }
  | { kind: 'intro'; index: number }
  | { kind: 'flashcard'; blockIndex: number }
  | { kind: 'snake'; afterBlockIndex: number }
  | { kind: 'quiz' }
  | { kind: 'survey' }
  | { kind: 'end' };

export type SessionState = {
  phase: Phase;
  participantId: string | null;
  intake: IntakeData | null;
  people: Person[];
  modeAssignment: ModeAssignment;
  memoryPhrases: Record<string, string>;
  studyConfig: StudyConfig | null;
};

export type Action =
  | { type: 'startSession'; participantId: string; intake: IntakeData }
  | { type: 'advancePhase' }
  | { type: 'setPhase'; phase: Phase }
  | { type: 'setIntroIndex'; index: number }
  | { type: 'setMemoryPhrase'; personId: string; phrase: string }
  | { type: 'setPeople'; people: Person[] }
  | { type: 'setModeAssignment'; modeAssignment: ModeAssignment }
  | { type: 'setParticipantId'; participantId: string }
  | { type: 'setStudyConfig'; studyConfig: StudyConfig }
  | { type: 'clearStudyConfig' };

export const initialState: SessionState = {
  phase: { kind: 'welcome' },
  participantId: null,
  intake: null,
  people: [],
  modeAssignment: {},
  memoryPhrases: {},
  studyConfig: null,
};

export function nextPhase(phase: Phase, sc: StudyConfig | null): Phase {
  if (!sc) {
    throw new Error('nextPhase called without studyConfig');
  }
  switch (phase.kind) {
    case 'welcome':
      return { kind: 'intro', index: 0 };
    case 'intro':
      return { kind: 'flashcard', blockIndex: 0 };
    case 'flashcard': {
      const isLast = phase.blockIndex === sc.flashcardBlockCount - 1;
      if (sc.snakeEnabled) {
        return { kind: 'snake', afterBlockIndex: phase.blockIndex };
      }
      if (isLast) return { kind: 'quiz' };
      return { kind: 'flashcard', blockIndex: phase.blockIndex + 1 };
    }
    case 'snake': {
      const nextBlock = phase.afterBlockIndex + 1;
      if (nextBlock >= sc.flashcardBlockCount) return { kind: 'quiz' };
      return { kind: 'flashcard', blockIndex: nextBlock };
    }
    case 'quiz':
      return { kind: 'survey' };
    case 'survey':
      return { kind: 'end' };
    case 'end':
      return phase;
    case 'proctor-builder':
      return phase; // back button uses setPhase, not advancePhase
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
      return { ...state, phase: nextPhase(state.phase, state.studyConfig) };
    case 'setPhase':
      return { ...state, phase: action.phase };
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
    case 'setStudyConfig':
      return { ...state, studyConfig: action.studyConfig };
    case 'clearStudyConfig':
      return {
        ...state,
        studyConfig: null,
        people: [],
        modeAssignment: {},
        memoryPhrases: {},
      };
  }
}
