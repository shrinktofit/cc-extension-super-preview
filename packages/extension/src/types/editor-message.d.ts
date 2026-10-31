import type {
  EvaluatePresetLaunchParamsRequest,
  EvaluatePresetLaunchParamsResult,
  PresetSelection,
} from '../preset-protocol.js';
import type { SceneSelection } from '../scene-protocol.js';

declare global {
  interface EditorMessageMaps {
    'super-preview': {
      'query-presets': {
        params: [];
        result: PresetSelection;
      };
      'select-preset': {
        params: [presetId?: string];
        result: void;
      };
      'query-scenes': {
        params: [];
        result: SceneSelection;
      };
      'select-scene': {
        params: [scene: string];
        result: void;
      };
      'evaluate-preset-launch-params': {
        params: [request: EvaluatePresetLaunchParamsRequest];
        result: EvaluatePresetLaunchParamsResult;
      };
      'open': {
        params: [];
        result: void;
      };
    };
  }
}

export {};
