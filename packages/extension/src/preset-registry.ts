import {
  isAbsolute,
  relative,
  resolve,
  sep,
} from 'node:path';
import { z } from 'zod';
import { logger } from './logger.js';
import {
  formatErrorForDiagnosticLog,
  writeServerDiagnosticLog,
} from './contributions/server/diagnostic-log.js';

const presetDeclarationSchema = z.strictObject({
  export: z.string().trim().min(1, 'preset export must be a non-empty name').optional(),
  id: z.string().regex(
    /^[a-z0-9][a-z0-9-]*$/u,
    'preset id must be lower-case kebab-case',
  ),
  module: z.string().min(1, 'preset module must be a non-empty path').refine(
    (modulePath) => !isAbsolute(modulePath),
    'preset module must be relative to its package',
  ),
});

const presetResultSchema = z.strictObject({
  launchParams: z.record(z.string(), z.string()),
  scene: z.string().optional(),
});

type PresetDeclaration = z.infer<typeof presetDeclarationSchema>;

export interface PresetContext {
  projectPath: string;
  requestUrl: URL;
}

export type PresetResult = z.infer<typeof presetResultSchema>;

export type PresetCallback = (
  context: PresetContext,
) => PresetResult | Promise<PresetResult>;

interface PresetRecord {
  callback?: PresetCallback;
  declaration: PresetDeclaration;
  moduleLoaded: boolean;
  modulePath: string;
  packageInfo: Editor.Interface.PackageInfo;
}

export class PresetNotFoundError extends Error {
  constructor(readonly presetId: string) {
    super(`Super Preview preset is not available: ${presetId}`);
    this.name = 'PresetNotFoundError';
  }
}

export class PresetConflictError extends Error {
  constructor(
    readonly presetId: string,
    readonly contributors: readonly string[],
  ) {
    super(`Super Preview preset has multiple enabled contributors: ${presetId}`);
    this.name = 'PresetConflictError';
  }
}

export class PresetRegistry {
  readonly contributions = {
    register: (
      _packageInfo: Editor.Interface.PackageInfo,
      _contribution: unknown,
    ) => {
      // Vortex follows registration with enable for active contributor packages.
    },

    enable: (
      packageInfo: Editor.Interface.PackageInfo,
      contribution: unknown,
    ) => {
      this._removePackageRecords(packageInfo);
      const parsedContribution = createPresetContributionSchema(
        packageInfo.path,
      ).safeParse(contribution);
      if (!parsedContribution.success) {
        this._logInvalidContribution(
          packageInfo,
          z.prettifyError(parsedContribution.error),
        );
        return;
      }

      for (const declaration of parsedContribution.data.presets) {
        this._registerPreset(packageInfo, declaration);
      }
    },

    disable: (packageInfo: Editor.Interface.PackageInfo) => {
      this._removePackageRecords(packageInfo);
    },

    unregister: (packageInfo: Editor.Interface.PackageInfo) => {
      this._removePackageRecords(packageInfo);
    },
  };

  async evaluatePreset(
    presetId: string,
    context: PresetContext,
  ): Promise<PresetResult> {
    const records = this._recordsByPreset.get(presetId);
    if (!records?.size) {
      throw new PresetNotFoundError(presetId);
    }

    const enabledRecords = Array.from(records.values());
    if (enabledRecords.length > 1) {
      throw new PresetConflictError(
        presetId,
        enabledRecords.map((record) => record.packageInfo.name),
      );
    }

    const [record] = enabledRecords;
    const callback = this._loadPresetCallback(record);
    const result = presetResultSchema.safeParse(await callback(context));
    if (!result.success) {
      throw new Error(
        `Super Preview preset returned an invalid result: ${record.packageInfo.name}/${presetId}\n${z.prettifyError(result.error)}`,
      );
    }

    return Object.freeze({
      launchParams: Object.freeze(result.data.launchParams),
      scene: result.data.scene,
    });
  }

  dispose() {
    for (const records of this._recordsByPreset.values()) {
      for (const record of records.values()) {
        this._removeModuleCache(record);
      }
    }
    this._recordsByPreset.clear();
  }

  private readonly _recordsByPreset = new Map<
    string,
    Map<string, PresetRecord>
  >();

  private _registerPreset(
    packageInfo: Editor.Interface.PackageInfo,
    declaration: PresetDeclaration,
  ) {
    const modulePath = resolve(packageInfo.path, declaration.module);
    const record: PresetRecord = {
      declaration,
      moduleLoaded: false,
      modulePath,
      packageInfo,
    };

    const records = this._recordsByPreset.get(declaration.id) ?? new Map();
    records.set(packageInfo.name, record);
    this._recordsByPreset.set(declaration.id, records);
  }

  private _loadPresetCallback(record: PresetRecord) {
    if (record.callback) {
      return record.callback;
    }

    let module: unknown;
    try {
      module = Editor.Module.requireFile(record.modulePath);
    } catch (error) {
      Editor.Module.removeCache(record.modulePath);
      throw error;
    }
    record.moduleLoaded = true;
    const exportName = record.declaration.export ?? 'default';
    const parsedModule = z.record(z.string(), z.unknown()).safeParse(module);
    const callback = exportName === 'default' && typeof module === 'function'
      ? module
      : parsedModule.success
        ? parsedModule.data[exportName]
        : undefined;
    if (typeof callback !== 'function') {
      throw new Error(
        `Super Preview preset export is not a function: ${record.packageInfo.name}/${record.declaration.id}#${exportName}`,
      );
    }

    record.callback = callback as PresetCallback;
    return record.callback;
  }

  private _removePackageRecords(packageInfo: Editor.Interface.PackageInfo) {
    for (const [presetId, records] of this._recordsByPreset) {
      const record = records.get(packageInfo.name);
      if (!record) {
        continue;
      }

      this._removeModuleCache(record);
      records.delete(packageInfo.name);
      if (!records.size) {
        this._recordsByPreset.delete(presetId);
      }
    }
  }

  private _removeModuleCache(record: PresetRecord) {
    if (!record.moduleLoaded) {
      return;
    }

    Editor.Module.removeCache(record.modulePath);
    record.moduleLoaded = false;
    record.callback = undefined;
  }

  private _logInvalidContribution(
    packageInfo: Editor.Interface.PackageInfo,
    reason: string,
    presetId?: string,
  ) {
    logger.error(`invalid preset contribution from ${packageInfo.name}: ${reason}`);
    writeServerDiagnosticLog('error', 'preset-contribution-invalid', {
      packageName: packageInfo.name,
      packagePath: packageInfo.path,
      presetId,
      reason: formatErrorForDiagnosticLog(new Error(reason)),
    });
  }
}

function createPresetContributionSchema(packagePath: string) {
  return z.strictObject({
    presets: z.array(presetDeclarationSchema.refine(
      (declaration) => isPathInside(
        packagePath,
        resolve(packagePath, declaration.module),
      ),
      {
        message: 'preset module must stay inside its package',
        path: ['module'],
      },
    )),
  });
}

function isPathInside(parentPath: string, childPath: string) {
  const relativePath = relative(parentPath, childPath);
  return relativePath !== '..'
    && !relativePath.startsWith(`..${sep}`)
    && !isAbsolute(relativePath);
}
