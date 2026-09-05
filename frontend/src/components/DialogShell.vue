<script setup>
import { nextTick, onMounted, ref, watch } from "vue";
import { Close } from "@element-plus/icons-vue";
import IconButton from "./IconButton.vue";

const props = defineProps({ open: Boolean, title: String, compact: Boolean });
const emit = defineEmits(["update:open"]);
const dialog = ref(null);
function close() { emit("update:open", false); }
async function sync() {
  await nextTick();
  if (!dialog.value) return;
  if (props.open && !dialog.value.open) dialog.value.showModal();
  else if (!props.open && dialog.value.open) dialog.value.close();
}
watch(() => props.open, sync);
onMounted(sync);
function backdrop(event) {
  if (event.target !== dialog.value) return;
  const rect = dialog.value.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right
    || event.clientY < rect.top || event.clientY > rect.bottom) close();
}
</script>

<template>
  <dialog ref="dialog" class="dialog" :class="{ compact }" :aria-label="title"
          @cancel.prevent="close" @close="close" @click="backdrop">
    <header class="dialog-header">
      <h2>{{ title }}</h2>
      <div class="dialog-tools"><slot name="tools" /><IconButton label="关闭弹窗" :icon="Close" @click="close" /></div>
    </header>
    <div class="dialog-body"><slot /></div>
    <footer v-if="$slots.footer" class="dialog-footer"><slot name="footer" /></footer>
  </dialog>
</template>
