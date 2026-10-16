import { getSuperPreviewConfig } from '../config';

const system = window.System;
if (!system) {
  throw new Error('SystemJS was not loaded');
}

const engineImportGuide = getSuperPreviewConfig().boot.engineImportGuide;
if (engineImportGuide) {
  const options = engineImportGuide.options;
  const { ImportGuide } = await import(/* @vite-ignore */ engineImportGuide.url) as {
    ImportGuide: new(environment: typeof options) => {
      resolve(specifier: string, parent: string): string;
      loadSyntheticModuleSource(url: string): string | undefined;
    };
  };
  const guide = new ImportGuide(options);
  const prototype = system.constructor.prototype;
  const originalResolve = prototype.resolve;
  prototype.resolve = function (specifier, parent) {
    const engineUrl = guide.resolve(specifier, parent ?? document.baseURI);
    return engineUrl !== specifier ? engineUrl : originalResolve.call(this, specifier, parent);
  };
  const originalInstantiate = prototype.instantiate;
  prototype.instantiate = function (url, parent) {
    const source = guide.loadSyntheticModuleSource(url);
    if (source === undefined) {
      return originalInstantiate.call(this, url, parent);
    }
    // ImportGuide generates System.register source for synthetic cc and cc/env modules.
    new Function('System', source)(this);
    return this.getRegister();
  };
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
