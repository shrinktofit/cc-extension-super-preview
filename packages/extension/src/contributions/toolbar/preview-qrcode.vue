<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue';
import { VortexButton, VortexIcon, VortexQrcode } from '@vortex/ui-elements-vue';

const props = defineProps<{ disabled: boolean }>();
const popupId = useId();
const anchor = ref<HTMLDivElement>();
const popup = ref<HTMLDivElement>();
const opened = ref(false);
const previewUrl = ref('');
const loading = ref(false);
const errorMessage = ref('');
const copied = ref(false);
const copyError = ref(false);
let requestVersion = 0;
let resizeObserver: ResizeObserver;

async function refreshUrl() {
  if (!opened.value) return;
  const version = ++requestVersion;
  previewUrl.value = '';
  errorMessage.value = '';
  copied.value = false;
  copyError.value = false;
  loading.value = true;
  try {
    const url = await Editor.Message.request('super-preview', 'query-preview-url');
    if (version === requestVersion && opened.value) previewUrl.value = url;
  } catch (error) {
    if (version === requestVersion && opened.value) {
      errorMessage.value = '无法获取预览地址，请关闭后重试。';
      console.error('[Super Preview] Failed to query preview URL', error);
    }
  } finally {
    if (version === requestVersion) {
      loading.value = false;
      await nextTick();
      positionPopup();
    }
  }
}

function closePopup() {
  if (opened.value) popup.value!.hidePopover();
  opened.value = false;
  requestVersion++;
}

function togglePopup() {
  if (opened.value) {
    closePopup();
  } else if (!props.disabled) {
    popup.value!.showPopover();
    opened.value = true;
    positionPopup();
    void refreshUrl();
  }
}

function onToggle(event: Event) {
  if ((event as ToggleEvent).newState === 'closed' && !popup.value?.matches(':popover-open')) {
    opened.value = false;
    requestVersion++;
  }
}

function positionPopup() {
  if (!opened.value) return;
  const rect = anchor.value!.getBoundingClientRect();
  const panel = popup.value!;
  const bounds = panel.getBoundingClientRect();
  const width = window.visualViewport?.width ?? window.innerWidth;
  const height = window.visualViewport?.height ?? window.innerHeight;
  const edge = 8;
  const gap = 4;
  const below = height - rect.bottom - edge - gap;
  const top = bounds.height <= below ? rect.bottom + gap : rect.top - bounds.height - gap;
  panel.style.left = Math.max(edge, Math.min(rect.right - bounds.width, width - bounds.width - edge)) + 'px';
  panel.style.top = Math.max(edge, Math.min(top, height - bounds.height - edge)) + 'px';
}

async function copyUrl() {
  const url = previewUrl.value;
  copied.value = false;
  copyError.value = false;
  try {
    await Editor.Message.request('super-preview', 'copy-preview-url', url);
    if (previewUrl.value === url) copied.value = true;
  } catch (error) {
    if (previewUrl.value === url) copyError.value = true;
    console.error('[Super Preview] Failed to copy preview URL', error);
  }
}

const urlEvents = ['super-preview:presets-changed', 'super-preview:scenes-changed', 'preview:ip-change', 'preview:port-change'];
watch(() => props.disabled, (disabled) => {
  if (disabled && opened.value) closePopup();
});

onMounted(() => {
  for (const event of urlEvents) Editor.Message.__protected__.addBroadcastListener(event, refreshUrl);
  window.addEventListener('resize', positionPopup);
  window.addEventListener('scroll', positionPopup, true);
  resizeObserver = new ResizeObserver(positionPopup);
  resizeObserver.observe(anchor.value!);
  resizeObserver.observe(popup.value!);
});

onBeforeUnmount(() => {
  closePopup();
  resizeObserver.disconnect();
  window.removeEventListener('resize', positionPopup);
  window.removeEventListener('scroll', positionPopup, true);
  for (const event of urlEvents) Editor.Message.__protected__.removeBroadcastListener(event, refreshUrl);
});
</script>

<template>
  <div
    ref="anchor"
    class="super-preview-share"
  >
    <VortexButton
      class="super-preview-qrcode-trigger transparent"
      variant="icon"
      size="small"
      title="扫一扫预览"
      aria-label="预览二维码"
      :aria-expanded="opened"
      :aria-controls="popupId"
      :disabled="disabled"
      @confirm="togglePopup"
    >
      <VortexIcon value="qr-code" />
    </VortexButton>
    <div
      :id="popupId"
      ref="popup"
      class="super-preview-share-popover"
      popover="auto"
      aria-label="扫一扫预览"
      @toggle="onToggle"
    >
      <span
        v-if="loading"
        role="status"
      >正在获取预览地址…</span>
      <span
        v-else-if="errorMessage"
        role="alert"
      >{{ errorMessage }}</span>
      <template v-else-if="previewUrl">
        <VortexQrcode
          :value="previewUrl"
          :size="128"
          :margin="1"
          label="Super Preview 预览二维码"
        />
        <div class="super-preview-share-address">
          <span class="super-preview-share-url">{{ previewUrl }}</span>
          <VortexButton
            class="super-preview-copy-url transparent"
            variant="icon"
            size="small"
            :title="copied ? '已复制' : '复制预览地址'"
            aria-label="复制预览地址"
            @confirm="copyUrl"
          >
            <VortexIcon :value="copied ? 'check' : 'copy'" />
          </VortexButton>
        </div>
        <span
          class="super-preview-share-hint"
          role="status"
        >{{ copied ? '已复制预览地址' : copyError ? '复制失败，请重试' : '扫一扫预览' }}</span>
      </template>
    </div>
  </div>
</template>
