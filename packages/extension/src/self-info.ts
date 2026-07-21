import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface PackageJson {
  name: string;
  version: string;
  extensionName?: string;
  vortex?: {
    extensionName?: string;
  };
}

const selfPackagePath = resolve(__dirname, '..');

export const selfPackageJson = JSON.parse(
  readFileSync(resolve(selfPackagePath, 'package.json'), 'utf8'),
) as PackageJson;

export const selfExtensionName = selfPackageJson.vortex?.extensionName
  ?? selfPackageJson.extensionName
  ?? selfPackageJson.name;
