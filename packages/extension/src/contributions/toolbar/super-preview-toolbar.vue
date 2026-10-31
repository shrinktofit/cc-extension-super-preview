<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { vortexEditorThemeTokens } from '@vortex/editor-theme';
import { VortexSelect } from '@vortex/ui-elements-vue';
import type { VortexSelectChangeDetail, VortexSelectValue } from '@vortex/ui-elements';
import type { PresetSelection, PresetSummary } from '../../preset-protocol.js';
import { currentScene, type SceneSelection, type SceneSummary } from '../../scene-protocol.js';
import PreviewQrcode from './preview-qrcode.vue';

const presetState = shallowRef<PresetSelection>({ presets: [] });
const sceneState = shallowRef<SceneSelection>({ scenes: [], selectedScene: currentScene });
const selectedPresetId = ref<VortexSelectValue>('');
const selectedSceneId = ref<VortexSelectValue>(currentScene);
const presetsLoaded = ref(false);
const scenesLoaded = ref(false);
const savingPreset = ref(false);
const savingScene = ref(false);
const opening = ref(false);
let disposed = false;
let presetQueryVersion = 0;
let sceneQueryVersion = 0;

const selectedPreset = computed(() => presetState.value.presets.find(
  (entry) => entry.id === presetState.value.selectedPresetId,
));
const selectedScene = computed(() => sceneState.value.scenes.find(
  (entry) => entry.uuid === sceneState.value.selectedScene,
));
const unavailablePreset = computed(() => {
  if (!presetState.value.selectedPresetId) return undefined;
  return selectedPreset.value
    ? selectedPreset.value.unavailableReason
    : `预设已不可用：${presetState.value.selectedPresetId}，请选择其他预设。`;
});
const unavailableScene = computed(() => sceneState.value.selectedScene !== currentScene && !selectedScene.value
  ? `场景已不可用：${sceneState.value.selectedScene}，请选择其他场景。`
  : undefined);
const presetOptions = computed<PresetSummary[]>(() => [
  { id: '', label: '无预设' },
  ...presetState.value.presets,
  ...(presetState.value.selectedPresetId && !selectedPreset.value
    ? [{ id: presetState.value.selectedPresetId, label: presetState.value.selectedPresetId, unavailableReason: unavailablePreset.value }]
    : []),
]);
const sceneOptions = computed<SceneSummary[]>(() => [
  { uuid: currentScene, label: '当前场景', url: '' },
  ...sceneState.value.scenes,
  ...(unavailableScene.value
    ? [{ uuid: sceneState.value.selectedScene, label: sceneState.value.selectedScene, url: '', unavailableReason: unavailableScene.value }]
    : []),
]);
const presetTitle = computed(() => unavailablePreset.value ?? (selectedPreset.value
  ? [selectedPreset.value.label, selectedPreset.value.description].filter(Boolean).join('\n')
  : '无预设：使用右侧选择的场景'));
const sceneTitle = computed(() => unavailableScene.value ?? (selectedScene.value
  ? `${selectedScene.value.label}\n${selectedScene.value.url}`
  : '当前正在编辑的场景'));
const presetDisabled = computed(() => !presetsLoaded.value || opening.value || savingPreset.value);
const sceneDisabled = computed(() => !scenesLoaded.value || opening.value || savingScene.value);
const launchDisabled = computed(() => presetDisabled.value || sceneDisabled.value
  || !!unavailablePreset.value || !!unavailableScene.value);
const launchLabel = computed(() => {
  const preset = selectedPreset.value?.label ?? presetState.value.selectedPresetId ?? '无预设';
  const scene = sceneState.value.selectedScene === currentScene
    ? '当前场景'
    : selectedScene.value?.label ?? sceneState.value.selectedScene;
  return `Super Preview：${preset} / ${scene}`;
});
const launchTooltip = computed(() => unavailablePreset.value ?? unavailableScene.value
  ?? launchLabel.value + (presetState.value.selectedPresetId ? '\n预设指定的场景优先；未指定时使用右侧场景。' : ''));

function optionLabel(option: PresetSummary | SceneSummary) {
  return option.unavailableReason ? `${option.label}（不可用）` : option.label;
}

async function refreshPresets() {
  const version = ++presetQueryVersion;
  const result = await Editor.Message.request('super-preview', 'query-presets');
  if (!disposed && version === presetQueryVersion) {
    presetState.value = result;
    presetsLoaded.value = true;
    if (!savingPreset.value) selectedPresetId.value = result.selectedPresetId ?? '';
  }
}

async function refreshScenes() {
  const version = ++sceneQueryVersion;
  const result = await Editor.Message.request('super-preview', 'query-scenes');
  if (!disposed && version === sceneQueryVersion) {
    sceneState.value = result;
    scenesLoaded.value = true;
    if (!savingScene.value) selectedSceneId.value = result.selectedScene;
  }
}

async function selectPreset(event: CustomEvent<VortexSelectChangeDetail<PresetSummary>>) {
  if (presetDisabled.value) return;
  savingPreset.value = true;
  try {
    const value = event.detail.value;
    await Editor.Message.request('super-preview', 'select-preset', value ? String(value) : undefined);
    await refreshPresets();
  } catch (error) {
    console.error('[Super Preview] Failed to select preset', error);
  } finally {
    if (!disposed) {
      selectedPresetId.value = presetState.value.selectedPresetId ?? '';
      savingPreset.value = false;
    }
  }
}

async function selectScene(event: CustomEvent<VortexSelectChangeDetail<SceneSummary>>) {
  if (sceneDisabled.value) return;
  savingScene.value = true;
  try {
    await Editor.Message.request('super-preview', 'select-scene', String(event.detail.value));
    await refreshScenes();
  } catch (error) {
    console.error('[Super Preview] Failed to select scene', error);
  } finally {
    if (!disposed) {
      selectedSceneId.value = sceneState.value.selectedScene;
      savingScene.value = false;
    }
  }
}

async function openPreview() {
  if (launchDisabled.value) return;
  opening.value = true;
  try {
    await Editor.Message.request('super-preview', 'open');
  } catch (error) {
    console.error('[Super Preview] Failed to open preview', error);
  } finally {
    opening.value = false;
  }
}

function onPresetsChanged() {
  void refreshPresets().catch((error: unknown) => console.error('[Super Preview] Failed to refresh presets', error));
}

function onScenesChanged() {
  void refreshScenes().catch((error: unknown) => console.error('[Super Preview] Failed to refresh scenes', error));
}

function onSceneAssetChanged(_uuid: unknown, info: unknown) {
  if ((info as { type: string }).type === 'cc.SceneAsset') onScenesChanged();
}

const sceneEvents = ['super-preview:scenes-changed', 'asset-db:ready'];
const assetEvents = ['asset-db:asset-add', 'asset-db:asset-change', 'asset-db:asset-delete'];

onMounted(() => {
  Editor.Message.__protected__.addBroadcastListener('super-preview:presets-changed', onPresetsChanged);
  for (const event of sceneEvents) Editor.Message.__protected__.addBroadcastListener(event, onScenesChanged);
  for (const event of assetEvents) Editor.Message.__protected__.addBroadcastListener(event, onSceneAssetChanged);
  void refreshPresets().catch((error: unknown) => console.error('[Super Preview] Failed to load presets', error));
  void refreshScenes().catch((error: unknown) => console.error('[Super Preview] Failed to load scenes', error));
});

onBeforeUnmount(() => {
  disposed = true;
  Editor.Message.__protected__.removeBroadcastListener('super-preview:presets-changed', onPresetsChanged);
  for (const event of sceneEvents) Editor.Message.__protected__.removeBroadcastListener(event, onScenesChanged);
  for (const event of assetEvents) Editor.Message.__protected__.removeBroadcastListener(event, onSceneAssetChanged);
});
</script>

<template>
  <div
    class="super-preview-toolbar"
    :style="vortexEditorThemeTokens"
    @dblclick.stop
  >
    <div class="super-preview-launch">
      <ui-button
        class="super-preview-open transparent"
        :tooltip="launchTooltip"
        :aria-label="'启动 ' + launchLabel"
        :disabled="launchDisabled || undefined"
        @click="openPreview"
      >
        <ui-icon value="play" />
      </ui-button>
      <span class="super-preview-footnote">SUPER</span>
    </div>
    <VortexSelect
      v-model="selectedPresetId"
      class="super-preview-preset"
      label="选择预设"
      :title="presetTitle"
      :options="presetOptions"
      :option-label="optionLabel"
      option-value="id"
      :option-disabled="(option) => !!option.unavailableReason"
      :filter-fields="['label', 'id']"
      filter
      filter-placeholder="搜索预设名称或 ID"
      empty-filter-message="没有匹配的预设"
      checkmark
      :disabled="presetDisabled"
      @change="selectPreset"
    />
    <VortexSelect
      v-model="selectedSceneId"
      class="super-preview-scene"
      label="选择场景"
      :title="sceneTitle"
      :options="sceneOptions"
      :option-label="optionLabel"
      option-value="uuid"
      :option-disabled="(option) => !!option.unavailableReason"
      :filter-fields="['label', 'url']"
      filter
      filter-placeholder="搜索场景名称或路径"
      empty-filter-message="没有匹配的场景"
      checkmark
      :disabled="sceneDisabled"
      @change="selectScene"
      @show="onScenesChanged"
    >
      <template #option="{ option }">
        <span
          class="super-preview-scene-option"
          :title="option.unavailableReason ?? option.url"
        >
          <span>{{ optionLabel(option) }}</span>
          <span
            v-if="option.url"
            class="super-preview-scene-path"
          >{{ option.url }}</span>
        </span>
      </template>
    </VortexSelect>
    <PreviewQrcode :disabled="launchDisabled" />
  </div>
</template>
