<script setup>
defineProps({ label: String, icon: [Object, Function], disabled: Boolean, spinning: Boolean });
</script>

<template>
  <button type="button" class="icon-button" :aria-label="label" :data-tooltip="label" :disabled="disabled">
    <component :is="icon" class="icon" :class="{ spinning }" aria-hidden="true" />
  </button>
</template>
