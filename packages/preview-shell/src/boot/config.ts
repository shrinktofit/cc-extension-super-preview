import { getSuperPreviewConfig } from '../config';

export function getBootConfig() {
  return getSuperPreviewConfig().boot;
}

export type { SuperPreviewBootConfig } from '../config';
