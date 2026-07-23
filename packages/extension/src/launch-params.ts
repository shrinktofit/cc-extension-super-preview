export type LaunchParams = Readonly<Record<string, string>>;

export function readUrlLaunchParams(url: URL): LaunchParams {
  return Object.freeze(Object.fromEntries(
    Array.from(url.searchParams)
      .filter(([key]) => key.startsWith('--') && key.length > 2)
      .map(([key, value]) => [key.slice(2), value]),
  ));
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
