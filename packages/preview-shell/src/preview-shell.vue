<template>
  <div id="content">
    <div id="GameDiv">
      <div id="Cocos3dGameContainer">
        <canvas
          id="GameCanvas"
          tabindex="-1"
        />
      </div>
      <LoadingProgressBar
        v-show="loading"
        :progress-width="progressWidth"
      />
      <ErrorOverlay
        v-show="errorVisible"
        :message="errorInfo.message"
        :stack="errorInfo.stack"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { logSuperPreviewDebug } from './boot/debug';
import ErrorOverlay from './error-overlay.vue';
import LoadingProgressBar from './loading-progress-bar.vue';

interface ErrorInfo {
  message: string;
  stack: string;
}

const loading = ref(false);
const progressWidth = ref('0%');
const errorVisible = ref(false);
const errorInfo = reactive<ErrorInfo>({
  message: '',
  stack: '',
});

function showLoading() {
  loading.value = true;
}

function hideSplash() {
  loading.value = false;
}

function reportLoadProgress(finished: number, total: number) {
  if (!total) {
    return;
  }

  progressWidth.value = `${Math.min(100, (finished / total) * 60).toFixed(2)}%`;
}

function reportBootStage(stage: string) {
  document.body.dataset.superPreviewStage = stage;
  logSuperPreviewDebug(`[Super Preview] stage ${stage}`);
}

function showError(info: ErrorInfo) {
  errorInfo.message = info.message;
  errorInfo.stack = info.stack;
  errorVisible.value = true;
}

defineExpose({
  hideSplash,
  reportBootStage,
  reportLoadProgress,
  showError,
  showLoading,
});
</script>

<style>
html,
body {
  width: 100%;
  /*
   * Tested on iPhone 13 Pro / iOS 26.2.1, in a home-screen PWA with
   * viewport-fit=cover and black-translucent: 100% follows the initial
   * 797px layout height, and 100dvh also stays at 797px on cold start.
   * 100vh uses the full 844px viewport height, expanding the root so
   * the viewport and Cocos canvas can fill the screen.
   */
  height: 100vh;
  margin: 0;
  overflow: hidden;
  color: #f7f7f7;
  font-family: Arial, Helvetica, sans-serif;
}

html {
  /*
   * Make the 100vh root the containing block for the absolute preview shell.
   * On iPhone 13 Pro / iOS 26.2.1, removing this leaves the shell and #content
   * at 797px even though the root is 844px and the engine sizes the canvas to 844px.
   */
  position: relative;
}

#super-preview-shell,
#content,
#GameDiv,
#Cocos3dGameContainer,
#GameCanvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

#GameCanvas {
  display: block;
  outline: none;
  background: transparent;
}

</style>
