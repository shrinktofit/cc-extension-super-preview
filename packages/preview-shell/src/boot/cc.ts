const system = window.System;
if (!system) {
  throw new Error('SystemJS was not loaded');
}

await system.prepareImport?.(true);
const cc = await system.import('cc');

export const {
  game,
  director,
  assetManager,
  DebugMode,
  Game,
} = cc;
