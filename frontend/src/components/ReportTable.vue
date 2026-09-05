<script setup>
import { Delete, Document, Download, Right } from "@element-plus/icons-vue";
import IconButton from "./IconButton.vue";
import { formatNumber } from "../lib/workspace";

defineProps({ reports: { type: Array, default: () => [] }, showChannel: Boolean, busy: Boolean });
defineEmits(["open", "download", "delete"]);
</script>

<template>
  <div class="report-table">
    <div class="report-columns" aria-hidden="true">
      <span>报告 / 时间范围</span><span>生成时间</span><span>消息数</span><span>类型</span><span></span>
    </div>
    <div v-for="report in reports" :key="report.file" class="report-row">
      <button class="report-title" aria-label="打开报告" @click="$emit('open', report)">
        <span class="report-symbol" :class="{ purple: report.reportType === 'rollup' }"><Document class="icon" /></span>
        <span class="report-title-text">
          <strong>{{ showChannel ? report.channelName || report.channelId : report.reportType === "rollup" ? "跨期深度汇总" : "频道分期总结" }}</strong>
          <small>{{ report.timeRange || report.file }}</small>
        </span>
        <Right class="icon row-arrow" />
      </button>
      <time class="report-date">{{ (report.generatedAt || "").slice(5, 16) }}</time>
      <span class="report-count">{{ formatNumber(report.count) }}<small> 条</small></span>
      <span><span class="type-label" :class="{ purple: report.reportType === 'rollup' }">{{ report.reportType === "rollup" ? "跨期汇总" : "分期总结" }}</span></span>
      <div class="row-actions">
        <IconButton label="下载报告" :icon="Download" @click="$emit('download', report.file)" />
        <IconButton label="删除报告" :icon="Delete" :disabled="busy" @click="$emit('delete', report)" />
      </div>
    </div>
    <div v-if="!reports.length" class="empty-state"><Document class="empty-icon" /><h3>暂无报告</h3></div>
  </div>
</template>
