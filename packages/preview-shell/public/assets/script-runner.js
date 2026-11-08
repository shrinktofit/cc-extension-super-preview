export async function runProjectPrerequisiteScripts() {
  await System.import('cce:/internal/x/prerequisite-imports');
}

export async function runBundlePrerequisiteScripts(bundleId) {
  await System.import(`virtual:///prerequisite-imports/${bundleId}`);
}
