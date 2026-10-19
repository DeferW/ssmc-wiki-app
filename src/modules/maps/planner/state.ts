import { MAX_ELEMENTS, translateElement, type PlanElement } from "./model";

const HISTORY_LIMIT = 100;

export type PlanState = { elements: PlanElement[]; past: PlanElement[][]; future: PlanElement[][] };

export type PlanAction =
  | { type: "add"; element: PlanElement }
  | { type: "replace"; index: number; element: PlanElement }
  | { type: "remove"; index: number }
  | { type: "move"; index: number; dx: number; dy: number }
  | { type: "set"; elements: PlanElement[] }
  | { type: "clear" }
  | { type: "undo" }
  | { type: "redo" };

export const EMPTY_PLAN: PlanState = { elements: [], past: [], future: [] };

function commit(state: PlanState, elements: PlanElement[]): PlanState {
  if (elements === state.elements) return state;
  return { elements, past: [...state.past, state.elements].slice(-HISTORY_LIMIT), future: [] };
}

/** Every change is undoable; a full plan ignores new elements instead of dropping old ones. */
export function planReducer(state: PlanState, action: PlanAction): PlanState {
  switch (action.type) {
    case "add":
      return state.elements.length >= MAX_ELEMENTS ? state : commit(state, [...state.elements, action.element]);
    case "replace":
      if (!state.elements[action.index]) return state;
      return commit(state, state.elements.map((element, index) => index === action.index ? action.element : element));
    case "remove":
      if (!state.elements[action.index]) return state;
      return commit(state, state.elements.filter((_, index) => index !== action.index));
    case "move": {
      const element = state.elements[action.index];
      if (!element || (action.dx === 0 && action.dy === 0)) return state;
      return commit(state, state.elements.map((current, index) => index === action.index ? translateElement(current, action.dx, action.dy) : current));
    }
    case "set":
      return commit(state, action.elements.slice(0, MAX_ELEMENTS));
    case "clear":
      return state.elements.length ? commit(state, []) : state;
    case "undo": {
      const previous = state.past.at(-1);
      if (!previous) return state;
      return { elements: previous, past: state.past.slice(0, -1), future: [state.elements, ...state.future] };
    }
    case "redo": {
      const next = state.future[0];
      if (!next) return state;
      return { elements: next, past: [...state.past, state.elements], future: state.future.slice(1) };
    }
  }
}
