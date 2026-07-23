import type {
  EvaluatePresetLaunchParamsRequest,
  EvaluatePresetLaunchParamsResult,
} from '../preset-protocol.js';

declare global {
  interface EditorMessageMaps {
    'super-preview': {
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
