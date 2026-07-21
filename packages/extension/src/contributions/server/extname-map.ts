import { logger } from '../../logger.js';

const CCONB_EXTENSION = '.cconb';
const REBUILD_DEBOUNCE_MS = 100;
const ASSET_DB_READY_TIMEOUT_MS = 30_000;

interface ExtnameMapSnapshot {
  revision: number;
  generatedAt: number;
  extensions: Record<string, string>;
}

export interface ExtnameMapStats {
  ready: boolean;
  rebuilding: boolean;
  revision: number;
  generatedAt: number;
  assetCount: number;
  cconbCount: number;
  rebuildCount: number;
  lastError?: string;
}

interface AssetInfo {
  uuid?: unknown;
  library?: unknown;
  subAssets?: unknown;
}

interface RebuildState {
  generation: number;
  promise: Promise<void>;
}

class ExtnameMap {
  async ensureInitialized(): Promise<void> {
    this._disposed = false;
    if (!this._initPromise) {
      this._initPromise = this._initialize().catch((error: unknown) => {
        this._initPromise = undefined;
        this._recordError(error);
        throw error;
      });
    }
    await this._initPromise;
  }

  async getSnapshot(): Promise<ExtnameMapSnapshot> {
    await this.ensureInitialized();
    return {
      revision: this._snapshot.revision,
      generatedAt: this._snapshot.generatedAt,
      extensions: { ...this._snapshot.extensions },
    };
  }

  getStats(): ExtnameMapStats {
    return { ...this._stats };
  }

  dispose() {
    this._disposed = true;
    this._generation += 1;

    if (this._rebuildTimer) {
      clearTimeout(this._rebuildTimer);
      this._rebuildTimer = undefined;
    }

    if (this._listenersRegistered) {
      Editor.Message.__protected__.removeBroadcastListener('asset-db:ready', this._onAssetDBReady);
      Editor.Message.__protected__.removeBroadcastListener('asset-db:refresh-finish', this._onAssetDBRefreshFinish);
      Editor.Message.__protected__.removeBroadcastListener('asset-db:close', this._onAssetDBClose);
      Editor.Message.__protected__.removeBroadcastListener('asset-db:asset-add', this._onAssetAdded);
      Editor.Message.__protected__.removeBroadcastListener('asset-db:asset-change', this._onAssetChanged);
      Editor.Message.__protected__.removeBroadcastListener('asset-db:asset-delete', this._onAssetDeleted);
      this._listenersRegistered = false;
    }

    this._initPromise = undefined;
    this._rebuildPromise = undefined;
    this._clear();
  }

  private _snapshot: ExtnameMapSnapshot = {
    revision: 0,
    generatedAt: 0,
    extensions: {},
  };

  private readonly _knownAssetUuids = new Set<string>();
  private readonly _assetTreeUuidsByRoot = new Map<string, Set<string>>();

  private _stats: ExtnameMapStats = {
    ready: false,
    rebuilding: false,
    revision: 0,
    generatedAt: 0,
    assetCount: 0,
    cconbCount: 0,
    rebuildCount: 0,
  };

  private _initPromise: Promise<void> | undefined;
  private _rebuildPromise: RebuildState | undefined;
  private _rebuildTimer: ReturnType<typeof setTimeout> | undefined;
  private _listenersRegistered = false;
  private _disposed = false;
  private _generation = 0;

  private readonly _onAssetDBReady = () => {
    this._scheduleRebuild('asset-db:ready');
  };

  private readonly _onAssetDBRefreshFinish = () => {
    this._scheduleRebuild('asset-db:refresh-finish');
  };

  private readonly _onAssetDBClose = () => {
    this._clear();
  };

  private readonly _onAssetAdded = (uuid: unknown, assetInfo: unknown) => {
    const generation = this._generation;
    void this._updateAssetFromEvent(uuid, assetInfo, generation).catch((error: unknown) => {
      this._recordError(error);
      logger.error('failed to update extname cache after asset add', error);
    });
  };

  private readonly _onAssetChanged = (uuid: unknown, assetInfo: unknown) => {
    const generation = this._generation;
    void this._updateAssetFromEvent(uuid, assetInfo, generation).catch((error: unknown) => {
      this._recordError(error);
      logger.error('failed to update extname cache after asset change', error);
    });
  };

  private readonly _onAssetDeleted = (uuid: unknown) => {
    if (typeof uuid !== 'string' || !uuid) {
      return;
    }

    const generation = this._generation;
    if (!this._isGenerationActive(generation)) {
      return;
    }

    this._removeAssetTree(uuid);
    this._publishSnapshot(this._snapshot.extensions, Date.now(), generation);
  };

  private async _initialize(): Promise<void> {
    const generation = this._generation;
    this._registerListeners();
    await this._rebuild('init', generation);
  }

  private _registerListeners() {
    if (this._listenersRegistered) {
      return;
    }

    Editor.Message.__protected__.addBroadcastListener('asset-db:ready', this._onAssetDBReady);
    Editor.Message.__protected__.addBroadcastListener('asset-db:refresh-finish', this._onAssetDBRefreshFinish);
    Editor.Message.__protected__.addBroadcastListener('asset-db:close', this._onAssetDBClose);
    Editor.Message.__protected__.addBroadcastListener('asset-db:asset-add', this._onAssetAdded);
    Editor.Message.__protected__.addBroadcastListener('asset-db:asset-change', this._onAssetChanged);
    Editor.Message.__protected__.addBroadcastListener('asset-db:asset-delete', this._onAssetDeleted);
    this._listenersRegistered = true;
  }

  private _scheduleRebuild(reason: string) {
    if (this._disposed) {
      return;
    }

    if (this._rebuildTimer) {
      clearTimeout(this._rebuildTimer);
    }

    const generation = this._generation;
    this._rebuildTimer = setTimeout(() => {
      this._rebuildTimer = undefined;
      void this._rebuild(reason, generation).catch((error: unknown) => {
        this._recordError(error);
        logger.error(`failed to rebuild extname cache after ${reason}`, error);
      });
    }, REBUILD_DEBOUNCE_MS);
  }

  private async _rebuild(reason: string, generation: number): Promise<void> {
    if (!this._isGenerationActive(generation)) {
      return;
    }

    if (this._rebuildPromise?.generation === generation) {
      await this._rebuildPromise.promise;
      return;
    }

    this._stats.rebuilding = true;
    const rebuildState: RebuildState = {
      generation,
      promise: this._rebuildNow(reason, generation),
    };
    this._rebuildPromise = rebuildState;

    try {
      await rebuildState.promise;
    } finally {
      if (this._rebuildPromise === rebuildState) {
        this._rebuildPromise = undefined;
      }
      if (this._isGenerationActive(generation)) {
        this._stats.rebuilding = false;
      }
    }
  }

  private async _rebuildNow(reason: string, generation: number): Promise<void> {
    logger.debug(`rebuilding extname cache: ${reason}`);
    await waitForAssetDBReady();
    const assets = await Editor.Message.request('asset-db', 'query-assets');
    if (!Array.isArray(assets)) {
      throw new Error('asset-db query-assets did not return an array');
    }
    if (!this._isGenerationActive(generation)) {
      return;
    }

    const extensions: Record<string, string> = {};
    this._knownAssetUuids.clear();
    this._assetTreeUuidsByRoot.clear();

    for (const asset of assets) {
      if (!isAssetInfo(asset) || typeof asset.uuid !== 'string' || !asset.uuid) {
        continue;
      }

      this._upsertAssetTree(extensions, asset);
    }

    this._stats.rebuildCount += 1;
    this._publishSnapshot(extensions, Date.now(), generation);
    logger.debug(`extname cache rebuilt: ${this._stats.cconbCount}/${this._stats.assetCount} cconb assets`);
  }

  private async _updateAssetFromEvent(uuid: unknown, assetInfo: unknown, generation: number): Promise<void> {
    if (typeof uuid !== 'string' || !uuid) {
      return;
    }

    const rootUuid = getRootUuid(uuid);
    let info = isAssetInfo(assetInfo) && assetInfo.uuid === rootUuid ? assetInfo : undefined;
    if (!info) {
      const queriedInfo = await Editor.Message.request('asset-db', 'query-asset-info', rootUuid);
      info = isAssetInfo(queriedInfo) ? queriedInfo : undefined;
    }
    if (!this._isGenerationActive(generation)) {
      return;
    }

    this._removeAssetTree(rootUuid);
    if (!info) {
      this._publishSnapshot(this._snapshot.extensions, Date.now(), generation);
      return;
    }

    this._upsertAssetTree(this._snapshot.extensions, info);
    this._publishSnapshot(this._snapshot.extensions, Date.now(), generation);
  }

  private _upsertAssetTree(extensions: Record<string, string>, rootAsset: AssetInfo) {
    if (typeof rootAsset.uuid !== 'string' || !rootAsset.uuid) {
      return;
    }

    const treeUuids = new Set<string>();
    forEachAssetInTree(rootAsset, (asset) => {
      if (typeof asset.uuid !== 'string' || !asset.uuid) {
        return;
      }

      treeUuids.add(asset.uuid);
      this._knownAssetUuids.add(asset.uuid);
      const extension = resolvePreviewExtname(asset);
      if (extension) {
        extensions[asset.uuid] = extension;
      } else {
        delete extensions[asset.uuid];
      }
    });
    this._assetTreeUuidsByRoot.set(rootAsset.uuid, treeUuids);
  }

  private _removeAssetTree(uuid: string) {
    const rootUuid = getRootUuid(uuid);
    const treeUuids = this._assetTreeUuidsByRoot.get(rootUuid) ?? new Set([uuid]);
    for (const treeUuid of treeUuids) {
      this._knownAssetUuids.delete(treeUuid);
      delete this._snapshot.extensions[treeUuid];
    }
    this._assetTreeUuidsByRoot.delete(rootUuid);
  }

  private _publishSnapshot(extensions: Record<string, string>, generatedAt: number, generation: number) {
    if (!this._isGenerationActive(generation)) {
      return;
    }

    const nextExtensions = { ...extensions };
    this._snapshot = {
      revision: this._snapshot.revision + 1,
      generatedAt,
      extensions: nextExtensions,
    };

    this._stats = {
      ...this._stats,
      ready: true,
      revision: this._snapshot.revision,
      generatedAt,
      assetCount: this._knownAssetUuids.size,
      cconbCount: Object.keys(nextExtensions).length,
      lastError: undefined,
    };
  }

  private _clear() {
    this._knownAssetUuids.clear();
    this._assetTreeUuidsByRoot.clear();
    this._snapshot = {
      revision: this._snapshot.revision + 1,
      generatedAt: Date.now(),
      extensions: {},
    };
    this._stats = {
      ...this._stats,
      ready: false,
      rebuilding: false,
      revision: this._snapshot.revision,
      generatedAt: this._snapshot.generatedAt,
      assetCount: 0,
      cconbCount: 0,
      lastError: undefined,
    };
  }

  private _recordError(error: unknown) {
    this._stats = {
      ...this._stats,
      ready: false,
      lastError: error instanceof Error ? error.message : String(error),
    };
  }

  private _isGenerationActive(generation: number) {
    return !this._disposed && generation === this._generation;
  }
}

function isAssetInfo(value: unknown): value is AssetInfo {
  return !!value && typeof value === 'object';
}

async function waitForAssetDBReady() {
  await new Promise<void>((resolve, reject) => {
    let settled = false;

    const finish = (error?: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      Editor.Message.__protected__.removeBroadcastListener('asset-db:ready', onReady);
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };

    const onReady = () => {
      finish();
    };

    Editor.Message.__protected__.addBroadcastListener('asset-db:ready', onReady);
    const timeout = setTimeout(() => {
      finish(new Error(`timed out waiting ${ASSET_DB_READY_TIMEOUT_MS}ms for asset-db:ready`));
    }, ASSET_DB_READY_TIMEOUT_MS);

    void Editor.Message.request('asset-db', 'query-ready').then((ready) => {
      if (ready) {
        finish();
      }
    }, finish);
  });
}

function forEachAssetInTree(asset: AssetInfo, visit: (asset: AssetInfo) => void) {
  visit(asset);

  const { subAssets } = asset;
  if (!subAssets || typeof subAssets !== 'object') {
    return;
  }

  for (const subAsset of Object.values(subAssets)) {
    if (isAssetInfo(subAsset)) {
      forEachAssetInTree(subAsset, visit);
    }
  }
}

function getRootUuid(uuid: string) {
  return uuid.split('@', 1)[0];
}

function resolvePreviewExtname(asset: AssetInfo): string {
  const { library } = asset;
  if (!library || typeof library !== 'object') {
    return '';
  }

  const keys = Object.keys(library);
  if (
    keys.length === 1
    && Object.prototype.hasOwnProperty.call(library, '.bin')
  ) {
    return CCONB_EXTENSION;
  }

  return '';
}

export const extnameMap = new ExtnameMap();
