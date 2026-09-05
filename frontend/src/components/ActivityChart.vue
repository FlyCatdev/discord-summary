<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { chartTicks, formatNumber } from "../lib/workspace";

const props = defineProps({ reports: { type: Array, default: () => [] } });
const canvas = ref(null);
const holder = ref(null);
const points = computed(() => props.reports.filter(r => r.reportType !== "rollup").slice(0, 14).reverse());
let observer;

function draw() {
  const element = canvas.value;
  if (!element || !holder.value) return;
  const width = holder.value.clientWidth;
  const height = 156;
  const ratio = Math.min(devicePixelRatio || 1, 2);
  element.width = width * ratio;
  element.height = height * ratio;
  const ctx = element.getContext("2d");
  ctx.scale(ratio, ratio);
  ctx.clearRect(0, 0, width, height);
  const data = points.value;
  const max = Math.max(...data.map(r => r.count || 0), 1);
  ctx.font = '10px "Segoe UI", sans-serif';
  ctx.textBaseline = "middle";
  for (let step = 0; step <= 3; step++) {
    const y = 12 + step * 36;
    ctx.strokeStyle = "#e9eded";
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width - 32, y); ctx.stroke();
    ctx.fillStyle = "#85918f";
    ctx.fillText(Math.round(max * (1 - step / 3)).toString(), width - 27, y);
  }
  if (!data.length) {
    ctx.fillStyle = "#87938f";
    ctx.textAlign = "center";
    ctx.fillText("暂无消息量记录", width / 2, 67);
    return;
  }
  const cell = (width - 38) / data.length;
  const tickIndices = chartTicks(data.length, width - 38);
  data.forEach((report, index) => {
    const x = cell * index + cell * 0.19;
    const barWidth = Math.min(cell * 0.62, 40);
    const barHeight = Math.max(3, (report.count || 0) / max * 103);
    ctx.fillStyle = index === data.length - 1 ? "#19745f" : "#bad8cd";
    ctx.beginPath(); ctx.roundRect(x, 120 - barHeight, barWidth, barHeight, [3, 3, 0, 0]); ctx.fill();
    if (tickIndices.includes(index)) {
      ctx.fillStyle = "#85918f";
      ctx.textAlign = "center";
      ctx.fillText((report.generatedAt || "").slice(11, 16), x + barWidth / 2, 141);
    }
  });
}
watch(points, draw, { flush: "post" });
onMounted(() => { observer = new ResizeObserver(draw); observer.observe(holder.value); draw(); });
onUnmounted(() => observer?.disconnect());
</script>

<template>
  <figure class="activity-chart" ref="holder">
    <canvas ref="canvas" aria-label="消息量趋势图" role="img"></canvas>
    <figcaption>
      <span>{{ points[0]?.generatedAt?.slice(0, 10) || "暂无记录" }} <template v-if="points.length">至 {{ points.at(-1)?.generatedAt?.slice(0, 10) }}</template></span>
      <span>最近 {{ points.length }} 份分期报告<span class="legend-dot"></span>{{ formatNumber(points.reduce((sum, r) => sum + (r.count || 0), 0)) }} 条消息</span>
    </figcaption>
  </figure>
</template>
