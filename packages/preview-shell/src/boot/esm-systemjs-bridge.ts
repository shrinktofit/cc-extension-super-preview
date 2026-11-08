export function installEsmSystemJsBridge(
  systemGlobal: SuperPreviewSystemJs,
  moduleIds: readonly string[],
): void {
  const prototype = systemGlobal.constructor.prototype;

  const originalResolve = prototype.resolve;
  prototype.resolve = function (specifier, parent) {
    return moduleIds.includes(specifier)
      ? specifier
      : originalResolve.call(this, specifier, parent);
  };

  const originalInstantiate = prototype.instantiate;
  prototype.instantiate = function (url, parent) {
    if (!moduleIds.includes(url)) {
      return originalInstantiate.call(this, url, parent);
    }
    this.register([], (_export) => ({
      setters: [],
      async execute() {
        _export(await import(/* @vite-ignore */ url));
      },
    }));
    return this.getRegister();
  };
}
