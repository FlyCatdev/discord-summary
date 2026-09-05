<script setup>
import { computed, defineAsyncComponent, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import {
  ArrowLeft, ArrowRight, Calendar, ChatDotSquare, Check, Clock, Close,
  Collection, Connection, CopyDocument, DataLine, Document, Download, Folder,
  Loading, MagicStick, Menu, Plus, Refresh, Search, Setting, Warning,
} from "@element-plus/icons-vue";
import { useWorkspace } from "./composables/useWorkspace";
import { formatNumber, selectReports } from "./lib/workspace";
import { downloadMarkdown } from "./lib/api";
import IconButton from "./components/IconButton.vue";
import DialogShell from "./components/DialogShell.vue";
import ReportTable from "./components/ReportTable.vue";
import ActivityChart from "./components/ActivityChart.vue";

const MarkdownView = defineAsyncComponent(() => import("./components/MarkdownView.vue"));
const SettingsPanel = defineAsyncComponent(() => import("./components/SettingsPanel.vue"));
const w = reactive(useWorkspace());
const menuOpen = ref(false);
const mobileQuery = window.matchMedia("(max-width: 700px)");
const mobile = ref(mobileQuery.matches);
function updateBreakpoint(event) { mobile.value = event.matches; menuOpen.value = false; }
onMounted(() => mobileQuery.addEventListener("change", updateBreakpoint));
onUnmounted(() => mobileQuery.removeEventListener("change", updateBreakpoint));
const query = ref("");
const reportChannel = ref("");
const reportKind = ref("");
const reportPage = ref(1);
const confirmation = reactive({ open: false, type: "", value: null, working: false });
const nav = [
  { id: "workspace", label: "频道工作台", icon: DataLine },
  { id: "reports", label: "报告档案", icon: Document },
  { id: "knowledge", label: "知识库", icon: Collection },
  { id: "settings", label: "连接与设置", icon: Setting },
];
const navLabel = computed(() => nav.find(item => item.id === w.page)?.label);
const filteredReports = computed(() => selectReports(w.reports, {
  channelId: reportChannel.value, kind: reportKind.value, query: query.value,
}));
const pageCount = computed(() => Math.max(1, Math.ceil(filteredReports.value.length / 20)));
const visibleReports = computed(() => filteredReports.value.slice((reportPage.value - 1) * 20, reportPage.value * 20));
const date = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric" }).format(new Date());
const currentSources = computed(() => w.currentReports.filter(report => report.reportType !== "rollup").length);
const taskLabel = computed(() => ({
  summary: "生成频道总结", rollup: "更新跨期汇总", schedule: "执行定时总结", knowledge: "重建知识库",
}[w.pending || w.stats.task?.kind] || "处理任务"));
const confirmTitle = computed(() => ({ report: "删除报告", channel: "移除频道", credential: "移除凭据" }[confirmation.type] || "确认操作"));

watch([query, reportChannel, reportKind], () => { reportPage.value = 1; });
watch(pageCount, count => { reportPage.value = Math.min(reportPage.value, count); });
watch(() => [w.page, w.selected], () => { menuOpen.value = false; });

function showReport(report) { w.openReport(report.file, report); }
function ask(type, value) { Object.assign(confirmation, { open: true, type, value }); }
async function confirm() {
  confirmation.working = true;
  try {
    if (confirmation.type === "report") await w.deleteReport(confirmation.value.file);
    else if (confirmation.type === "channel") await w.removeChannel(confirmation.value.id);
    else await w.clearCredential(confirmation.value);
  } finally { confirmation.open = false; confirmation.working = false; }
}
function allChannelReports() { reportChannel.value = w.selected; w.page = "reports"; }
</script>

<template>
  <div class="app-shell" @keydown.esc="menuOpen = false">
    <button v-if="menuOpen" class="sidebar-backdrop" aria-label="关闭导航" @click="menuOpen = false"></button>
    <aside class="sidebar" :class="{ open: menuOpen }" :inert="mobile && !menuOpen" :aria-hidden="mobile && !menuOpen || undefined">
      <div class="brand">
        <span class="brand-mark"><ChatDotSquare /></span>
        <div><strong>Discord<span class="brand-period">.</span></strong><small>频道档案</small></div>
        <IconButton class="mobile-close" label="关闭导航" :icon="Close" @click="menuOpen = false" />
      </div>
      <span class="nav-caption">工作空间</span>
      <nav class="primary-nav" aria-label="主导航">
        <button v-for="item in nav" :key="item.id" :class="{ active: w.page === item.id }" :aria-label="item.label"
                :aria-current="w.page === item.id ? 'page' : undefined" @click="w.page = item.id; menuOpen = false">
          <component :is="item.icon" class="icon" /><span>{{ item.label }}</span>
          <span v-if="item.id === 'reports'" class="nav-count">{{ w.reports.length }}</span>
        </button>
      </nav>
      <div class="nav-caption channel-caption"><span>已关注频道</span><IconButton label="管理频道" :icon="Plus" @click="w.page = 'settings'" /></div>
      <nav class="channel-nav" aria-label="频道列表">
        <button v-for="channel in w.channels" :key="channel.id" :class="{ selected: w.selected === channel.id && w.page === 'workspace' }"
                :aria-label="'选择频道 ' + channel.name" :title="channel.name" @click="w.selectChannel(channel.id); menuOpen = false">
          <span class="hash-icon">#</span><span class="channel-nav-name">{{ channel.name }}</span>
          <span v-if="w.pointers[channel.id]?.lastTs" class="channel-dot"></span>
        </button>
        <span v-if="!w.channels.length && !w.loading" class="sidebar-empty">暂无频道</span>
      </nav>
      <div class="sidebar-bottom">
        <div class="storage-status"><span class="local-glyph"><Folder class="icon" /></span><div><strong>本地工作区</strong><small>{{ w.reports.length }} 份已归档报告</small></div><span class="online-dot" :class="{ offline: !w.connected }"></span></div>
        <span class="sidebar-version">DISCORD SUMMARY <span>LOCAL / 01</span></span>
      </div>
    </aside>
    <div class="main-shell" :inert="mobile && menuOpen">
      <header class="topbar">
        <div class="breadcrumb"><IconButton class="mobile-menu" label="打开导航" :icon="Menu" @click="menuOpen = true" /><span>工作空间</span><span class="breadcrumb-slash">/</span><strong>{{ navLabel }}</strong></div>
        <div class="topbar-right"><span class="today"><Calendar class="icon" />{{ date }}</span><span class="topbar-divider"></span><IconButton label="刷新数据" :icon="Refresh" :spinning="w.refreshing" :disabled="w.refreshing" @click="w.refresh" /><span class="profile-mark" aria-label="本地用户">L</span></div>
      </header>
      <main>
        <div v-if="!w.connected" class="connection-banner"><Warning class="icon" /><span>服务连接中断</span><button class="text-button" @click="w.refresh">重新连接</button></div>
        <div v-if="w.busy" class="task-banner"><Loading class="icon spinning" /><strong>{{ taskLabel }}</strong><span>进行中</span><time v-if="w.stats.task?.startedAt">{{ w.stats.task.startedAt }}</time></div>
        <div v-if="w.loading" class="page-loading"><Loading class="icon spinning" /><span>加载工作区</span></div>
        <template v-else-if="w.page === 'workspace'">
          <div class="page-heading workspace-heading">
            <div class="channel-heading">
              <span class="channel-heading-symbol">#</span>
              <div><span class="eyebrow">{{ w.currentChannel?.guild || "CHANNEL WORKSPACE" }}</span><h1>{{ w.currentChannel?.name || "频道工作台" }}</h1><span class="channel-id" v-if="w.selected">{{ w.selected }}</span></div>
            </div>
            <div class="heading-actions">
              <span class="status-pill" :class="{ ok: !!w.pointers[w.selected]?.lastTs }"><span class="status-dot"></span>{{ w.pointers[w.selected]?.lastTs ? "增量已就绪" : "首次总结" }}</span>
              <button class="button" :disabled="w.busy || currentSources < 2" @click="w.rollup"><MagicStick class="icon" />跨期汇总</button>
            </div>
          </div>
          <section class="metrics" aria-label="频道统计">
            <div class="metric"><span>累计消息 <ChatDotSquare class="icon" /></span><strong>{{ formatNumber(w.currentMessages) }}<small>条</small></strong><small>按分期报告累计</small></div>
            <div class="metric"><span>归档报告 <Document class="icon" /></span><strong>{{ formatNumber(w.currentReports.length) }}<small>份</small></strong><small>{{ currentSources }} 份分期 · {{ w.currentReports.length - currentSources }} 份跨期</small></div>
            <div class="metric"><span>最近更新 <Clock class="icon" /></span><strong class="metric-date">{{ w.currentReports[0]?.generatedAt?.slice(5, 10) || "--" }}<small>{{ w.currentReports[0]?.generatedAt?.slice(11, 16) || "" }}</small></strong><small>{{ w.currentReports[0] ? "报告已存入本地" : "暂无总结记录" }}</small></div>
            <div class="metric"><span>自动总结 <Refresh class="icon" /></span><strong class="metric-state">{{ w.schedule.active ? "已启用" : "未运行" }}<span class="state-dot" :class="{ ok: w.schedule.active }"></span></strong><small>{{ w.schedule.active ? `每 ${w.cfg.scheduleHours} 小时执行` : w.cfg.scheduleEnabled ? "本次启动未启用调度线程" : "定时任务已关闭" }}</small></div>
          </section>
          <div class="insights-band">
            <section class="activity-section"><div class="section-heading"><h2>消息活动</h2><span class="muted-label">最近 14 份报告</span></div><ActivityChart :reports="w.currentReports" /></section>
            <section class="pipeline-section">
              <div class="section-heading"><h2>连接配置</h2><span class="tiny-label">CONFIG</span></div>
              <div class="pipeline-row"><span class="pipeline-icon"><Connection class="icon" /></span><div><strong>Discord</strong><small>{{ w.cfg.discordTokenSet ? "服务端凭据已配置" : "未配置凭据" }}</small></div><span class="connection-check" :class="{ ok: w.cfg.discordTokenSet }"><Check v-if="w.cfg.discordTokenSet" class="icon" /><span v-else>未连接</span></span></div>
              <div class="pipeline-row"><span class="pipeline-icon violet"><MagicStick class="icon" /></span><div><strong>{{ w.cfg.model || "总结模型" }}</strong><small>{{ w.cfg.protocol === "responses" ? "Responses" : "Chat Completions" }}</small></div><span class="connection-check" :class="{ ok: w.stats.llmSet }"><Check v-if="w.stats.llmSet" class="icon" /><span v-else>未配置</span></span></div>
              <button class="pipeline-footer" @click="w.page = 'settings'"><span>管理连接与参数</span><ArrowRight class="icon" /></button>
            </section>
          </div>
          <section class="composer-section">
            <div class="section-heading"><h2><MagicStick class="icon" />新建总结</h2><span class="muted-label" v-if="w.snapshot">{{ formatNumber(w.snapshot.count) }} 条消息已就绪</span></div>
            <form class="composer-form" @submit.prevent="w.fetchMessages">
              <label class="field composer-channel"><span>目标频道</span><select v-model="w.selected" aria-label="目标频道" :disabled="w.busy"><option value="" disabled>选择频道</option><option v-for="channel in w.channels" :key="channel.id" :value="channel.id">{{ channel.name }}</option></select></label>
              <label class="field"><span>时间范围（小时）</span><input v-model.number="w.cfg.hours" type="number" min="0" max="8760" required /></label>
              <label class="field"><span>消息上限</span><input v-model.number="w.cfg.limit" type="number" min="1" max="100000" required /></label>
              <div class="composer-actions"><button type="submit" class="button" :disabled="!w.selected || w.fetching || w.busy"><component :is="w.fetching ? Loading : Download" class="icon" :class="{ spinning: w.fetching }" />拉取消息</button><button type="button" class="button primary" :disabled="!w.snapshot?.transcript || w.busy || w.fetching" @click="w.summarize"><component :is="w.pending === 'summary' ? Loading : MagicStick" class="icon" :class="{ spinning: w.pending === 'summary' }" />生成总结</button></div>
            </form>
            <details v-if="w.snapshot" class="transcript-details">
              <summary><span>{{ w.snapshot.channelName }} · {{ w.snapshot.timeRange || "没有消息" }}</span><span>消息预览</span></summary>
              <div class="message-preview"><div v-for="(message, index) in w.snapshot.preview" :key="index"><time>{{ message.ts }}</time><strong>{{ message.author }}</strong><p>{{ message.content }}</p></div></div>
              <textarea readonly :value="w.snapshot.transcript" aria-label="原始聊天记录" rows="6"></textarea>
            </details>
          </section>
          <section class="reports-section">
            <div class="section-heading"><h2>最近报告 <span class="count-label">{{ w.currentReports.length }}</span></h2><button class="text-button" @click="allChannelReports">全部报告<ArrowRight class="icon" /></button></div>
            <ReportTable :reports="w.currentReports.slice(0, 6)" :busy="w.busy" @open="showReport" @download="w.downloadReport" @delete="report => ask('report', report)" />
          </section>
        </template>
        <template v-else-if="w.page === 'reports'">
          <div class="page-heading"><div><span class="eyebrow">REPORT ARCHIVE</span><h1>报告档案 <span class="heading-count">{{ w.reports.length }}</span></h1></div><span class="muted-label">Markdown / 本地归档</span></div>
          <div class="report-toolbar">
            <div class="segmented" aria-label="报告类型"><button v-for="kind in [{ value: '', label: '全部' }, { value: 'summary', label: '分期总结' }, { value: 'rollup', label: '跨期汇总' }]" :key="kind.value" :class="{ selected: reportKind === kind.value }" :aria-pressed="reportKind === kind.value" @click="reportKind = kind.value">{{ kind.label }}</button></div>
            <div class="report-filters"><select v-model="reportChannel" aria-label="筛选频道"><option value="">全部频道</option><option v-for="channel in w.channels" :key="channel.id" :value="channel.id">{{ channel.name }}</option></select><label class="search-field"><Search class="icon" /><input v-model="query" type="search" aria-label="搜索报告" placeholder="搜索频道、日期或文件" /></label></div>
          </div>
          <ReportTable :reports="visibleReports" :busy="w.busy" show-channel @open="showReport" @download="w.downloadReport" @delete="report => ask('report', report)" />
          <footer class="pagination"><span>共 {{ filteredReports.length }} 份报告</span><div><IconButton label="上一页" :icon="ArrowLeft" :disabled="reportPage <= 1" @click="reportPage--" /><span>{{ reportPage }} / {{ pageCount }}</span><IconButton label="下一页" :icon="ArrowRight" :disabled="reportPage >= pageCount" @click="reportPage++" /></div></footer>
        </template>
        <template v-else-if="w.page === 'knowledge'">
          <div class="page-heading"><div><span class="eyebrow">KNOWLEDGE LIBRARY</span><h1>知识库</h1></div><div class="heading-actions"><IconButton label="下载当前知识库页面" :icon="Download" :disabled="!w.kb.exists || w.kb.loading" @click="downloadMarkdown(w.kb.markdown, w.kb.activeFile?.split('/').at(-1) || 'knowledge-preview.md')" /><button class="button primary" :disabled="w.busy" @click="w.buildKnowledge"><Refresh class="icon" :class="{ spinning: w.pending === 'knowledge' }" />重建知识库</button></div></div>
          <select class="knowledge-mobile-select" aria-label="知识库页面" :value="w.kb.activeFile" @change="event => event.target.value ? w.openKnowledgePage(event.target.value) : w.loadKnowledge()"><option value="">聚合预览</option><option v-for="file in w.kb.pages" :key="file" :value="file">{{ file }}</option></select>
          <div class="knowledge-workspace">
            <aside class="knowledge-index"><div class="section-heading"><h2><Folder class="icon" />history / wiki</h2></div><button class="file-row" :class="{ active: !w.kb.activeFile }" @click="w.loadKnowledge"><Collection class="icon" />聚合预览</button><button v-for="file in w.kb.pages" :key="file" class="file-row" :class="{ active: file === w.kb.activeFile, nested: file.includes('/') }" @click="w.openKnowledgePage(file)"><Document class="icon" /><span>{{ file }}</span></button><div class="knowledge-meta"><span>当前页面</span><strong>{{ (w.kb.size / 1024).toFixed(1) }} KB</strong></div></aside>
            <section class="knowledge-document"><div v-if="w.kb.loading" class="page-loading"><Loading class="icon spinning" /></div><MarkdownView v-else-if="w.kb.exists" :content="w.kb.markdown" /><div v-else class="empty-state"><Collection class="empty-icon" /><h3>知识库尚未生成</h3></div></section>
          </div>
        </template>
        <SettingsPanel v-else-if="w.page === 'settings'" :workspace="w" @remove-channel="channel => ask('channel', channel)" @clear-credential="key => ask('credential', key)" />
        <footer class="page-footer"><span><span class="online-dot" :class="{ offline: !w.connected }"></span>{{ w.connected ? "本地服务已连接" : "服务连接中断" }}</span><span>DISCORD SUMMARY · {{ new Date().getFullYear() }}</span></footer>
      </main>
    </div>
    <DialogShell v-model:open="w.reader.open" title="报告阅读">
      <template #tools><IconButton label="复制 Markdown" :icon="CopyDocument" :disabled="w.reader.loading" @click="w.copyReport" /><IconButton label="下载 Markdown" :icon="Download" :disabled="w.reader.loading" @click="w.downloadReport(w.reader.file)" /></template>
      <div class="reader-meta"><span class="type-label" :class="{ purple: w.reader.meta?.reportType === 'rollup' }">{{ w.reader.meta?.reportType === "rollup" ? "跨期汇总" : "分期总结" }}</span><span>{{ w.reader.file }}</span></div>
      <div v-if="w.reader.loading" class="page-loading"><Loading class="icon spinning" /></div><MarkdownView v-else-if="w.reader.open" :content="w.reader.markdown" />
    </DialogShell>
    <DialogShell v-model:open="confirmation.open" :title="confirmTitle" compact>
      <p class="confirm-message">{{ confirmation.type === "report" ? "这份本地报告将被永久删除。" : confirmation.type === "channel" ? "频道将从关注列表移除，已有报告会保留。" : "服务端保存的凭据将被移除，相关连接将不可用。" }}</p>
      <p class="confirm-target">{{ confirmation.value?.file || confirmation.value?.name || "" }}</p>
      <template #footer><button class="button" :disabled="confirmation.working" @click="confirmation.open = false">取消</button><button class="button danger" :disabled="confirmation.working" @click="confirm">{{ confirmation.type === "report" ? "确认删除" : "确认移除" }}</button></template>
    </DialogShell>
    <div v-if="w.toast" role="status" class="toast" :class="w.toast.type"><component :is="w.toast.type === 'error' ? Warning : Check" class="icon" /><span>{{ w.toast.message }}</span><IconButton label="关闭通知" :icon="Close" @click="w.toast = null" /></div>
  </div>
</template>
