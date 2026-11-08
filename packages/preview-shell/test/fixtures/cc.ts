export const DebugMode = { INFO: 1, NONE: 0 };
export const Game = { EVENT_PRE_BASE_INIT: 'pre-base-init' };
export const game = {
  init: async () => {},
  on: () => {},
  run: (onStart: () => void) => onStart(),
  pause: () => {},
  resume: () => {},
};
export const director = { runSceneImmediate: () => {} };
export const assetManager = {
  pipeline: { remove: () => {}, insert: () => {} },
  fetchPipeline: { remove: () => {}, insert: () => {} },
  loadWithJson: () => {},
};
