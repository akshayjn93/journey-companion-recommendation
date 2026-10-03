export type TriggerPoint = {
  lng: number;
  lat: number;
};

export type Story = {
  id: string;
  title: string;
  category: string;
  tags: string[];
  summary: string;
  cue: string;
  triggerPoint: TriggerPoint | null;
  approxKm: number | null;
};

export type JourneySimulationResult = {
  journeyId: string;
  stories: Story[];
};
