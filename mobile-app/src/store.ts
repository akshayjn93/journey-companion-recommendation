import type { Story } from './types';

export type DrivingState = {
  isDriving: boolean;
  stories: Story[];
  triggeredIds: Set<string>;
  currentStoryId: string | null;
  statusMessage: string;
};

const state: DrivingState = {
  isDriving: false,
  stories: [],
  triggeredIds: new Set(),
  currentStoryId: null,
  statusMessage: 'Not driving yet.',
};

type Listener = (next: DrivingState) => void;
const listeners = new Set<Listener>();

export function getState(): DrivingState {
  return state;
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setState(partial: Partial<DrivingState>) {
  Object.assign(state, partial);
  listeners.forEach(listener => listener(state));
}

export function resetJourneyState(stories: Story[]) {
  setState({
    stories,
    triggeredIds: new Set(),
    currentStoryId: null,
    statusMessage: 'Waiting for GPS fix...',
  });
}

export function getCurrentStory(): Story | null {
  return state.stories.find(story => story.id === state.currentStoryId) ?? null;
}
