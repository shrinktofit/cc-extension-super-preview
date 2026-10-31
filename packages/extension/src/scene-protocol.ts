export const currentScene = 'current_scene';

export interface SceneSummary {
  uuid: string;
  label: string;
  url: string;
  unavailableReason?: string;
}

export interface SceneSelection {
  scenes: SceneSummary[];
  selectedScene: string;
}
