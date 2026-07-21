<template>
  <div
    id="error"
    class="error-overlay"
  >
    <div class="title">
      Error <i>(open the console for details)</i>
    </div>
    <div class="error-main">
      {{ message }}
    </div>
    <div class="error-stack">
      {{ stack }}
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  message: string;
  stack: string;
}>();
</script>

<style scoped>
.error-overlay {
  position: absolute;
  left: 16px;
  right: 16px;
  bottom: 16px;
  max-height: 45vh;
  overflow: auto;
  padding: 12px;
  z-index: 20;
  color: #fff;
  background: rgb(18 18 18 / 88%);
  border: 1px solid rgb(255 255 255 / 20%);
  font-size: 13px;
  line-height: 1.45;
  white-space: pre-wrap;
}

.title {
  margin-bottom: 8px;
  font-weight: 700;
}
</style>
