export type LaunchParams = Readonly<Record<string, string>>;

export function readUrlLaunchParams(url: URL): LaunchParams {
  return Object.freeze(Object.fromEntries(url.searchParams));
}

export function mergeLaunchParams(
  base: LaunchParams,
  overrides: LaunchParams,
): LaunchParams {
  return Object.freeze({
    ...base,
    ...overrides,
  });
}
