import type { LaunchParams } from './launch-params.js';

export interface PresetSummary {
  id: string;
  label: string;
  description?: string;
  unavailableReason?: string;
}

export interface PresetSelection {
  presets: PresetSummary[];
  selectedPresetId?: string;
}

export enum PresetLaunchParamsErrorCode {
  conflict = 'conflict',
  notFound = 'not-found',
}

export interface EvaluatePresetLaunchParamsRequest {
  presetId: string;
  requestUrl: string;
}

export type EvaluatePresetLaunchParamsResult
  = | {
    launchParams: LaunchParams;
    ok: true;
    scene?: string;
  }
  | {
    code: PresetLaunchParamsErrorCode;
    message: string;
    ok: false;
  };
