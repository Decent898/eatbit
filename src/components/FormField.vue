<script setup lang="ts">
defineProps<{
  label: string
  example?: string
}>()
</script>

<template>
  <div class="form-field">
    <div class="form-label">{{ label }}</div>
    <slot />
    <div v-if="example" class="form-example">例如：{{ example }}</div>
  </div>
</template>

<style scoped>
.form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  font-size: 14px;
  font-weight: 600;
}

.form-example {
  font-size: 12px;
  color: #76807f;
}
</style>
