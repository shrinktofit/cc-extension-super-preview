<template>
  <div
    id="splash"
    class="loading-screen"
  >
    <div class="progress-bar">
      <span :style="{ width: progressWidth }" />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  progressWidth: string;
}>();
</script>

<style scoped>
.loading-screen {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: transparent;
  z-index: 10;
}

.progress-bar {
  position: absolute;
  left: 50%;
  bottom: 10%;
  width: min(360px, 70vw);
  height: 6px;
  overflow: hidden;
  background: rgb(255 255 255 / 18%);
  transform: translateX(-50%);
}

.progress-bar span {
  display: block;
  width: 0%;
  height: 100%;
  background: #38bdf8;
  transition: width 160ms ease;
}

@media (orientation: portrait) {
  .progress-bar {
    bottom: 17%;
  }
}
</style>
