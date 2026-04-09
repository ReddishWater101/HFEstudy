import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from 'react';
import { initialState, sessionReducer, type Action, type SessionState } from './session';

const StateContext = createContext<SessionState | null>(null);
const DispatchContext = createContext<Dispatch<Action> | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(sessionReducer, initialState);
  return (
    <StateContext.Provider value={state}>
      <DispatchContext.Provider value={dispatch}>{children}</DispatchContext.Provider>
    </StateContext.Provider>
  );
}

export function useSession(): SessionState {
  const ctx = useContext(StateContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}

export function useDispatch(): Dispatch<Action> {
  const ctx = useContext(DispatchContext);
  if (!ctx) throw new Error('useDispatch must be used within SessionProvider');
  return ctx;
}

export function useSessionSelector<T>(selector: (state: SessionState) => T): T {
  return selector(useSession());
}
