import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { api, downloadMarkdown } from "../lib/api";
import { captureSnapshot, normalizeChannels, summarizePayload } from "../lib/workspace";

export function useWorkspace() {
  const cfg = reactive({
    channels: [], channelId: "", hours: 24, limit: 2000, apiBase: "", model: "",
    protocol: "chat", customPrompt: "", scheduleEnabled: false, scheduleHours: 1,
    scheduleLimit: 1000, discordTokenSet: false, apiKeySet: false, discordProxy: "",
  });
  const credentials = reactive({ discordToken: "", apiKey: "" });
  const page = ref("workspace");
  const selected = ref("");
  const reports = ref([]);
  const stats = ref({});
  const schedule = ref({});
  const pointers = ref({});
  const loading = ref(true);
  const connected = ref(true);
  const refreshing = ref(false);
  const fetching = ref(false);
  const saving = ref(false);
  const pending = ref("");
  const snapshot = ref(null);
  const toast = ref(null);
  const reader = reactive({ open: false, loading: false, file: "", markdown: "", meta: null });
  const kb = reactive({ exists: false, markdown: "", size: 0, loading: false, pages: [], activeFile: "" });
  const models = ref([]);
  const modelsLoading = ref(false);
  const checking = ref("");
  const newChannel = ref("");
  const savedConfig = ref("");
  let pollTimer;
  let toastTimer;
  let fetchController;
  let fetchVersion = 0;
  let readerVersion = 0;
  let knowledgeVersion = 0;
  let disposed = false;

  const channels = computed(() => normalizeChannels(
    cfg.channels.length ? cfg.channels : cfg.channelId ? [cfg.channelId] : [],
  ).map(channel => ({
    ...channel,
    name: channel.name || reports.value.find(report => report.channelId === channel.id)?.channelName || channel.id,
  })));
  const currentChannel = computed(() => channels.value.find(c => c.id === selected.value) || null);
  const currentReports = computed(() => reports.value.filter(r => r.channelId === selected.value));
  const currentMessages = computed(() => currentReports.value.reduce(
    (sum, report) => sum + (report.reportType === "rollup" ? 0 : report.count || 0), 0,
  ));
  const busy = computed(() => !!pending.value || !!stats.value.summarizing);

  function configPayload() {
    const { discordTokenSet, apiKeySet, ...configuration } = cfg;
    return JSON.parse(JSON.stringify(configuration));
  }
  const dirty = computed(() => savedConfig.value !== JSON.stringify(configPayload())
    || !!credentials.discordToken || !!credentials.apiKey);

  function notify(message, type = "success") {
    clearTimeout(toastTimer);
    toast.value = { message, type };
    toastTimer = setTimeout(() => { toast.value = null; }, 6000);
  }

  async function refreshData() {
    const [nextStats, history, nextSchedule, nextPointers] = await Promise.all([
      api("/api/stats"), api("/api/history"), api("/api/schedule/status"), api("/api/schedule/pointermap"),
    ]);
    stats.value = nextStats;
    reports.value = history.items || [];
    schedule.value = nextSchedule;
    pointers.value = nextPointers.pointers || {};
    connected.value = true;
  }

  async function refresh() {
    if (refreshing.value) return;
    refreshing.value = true;
    try { await refreshData(); }
    catch (error) { connected.value = false; notify(error.message, "error"); }
    finally { refreshing.value = false; }
  }

  async function poll() {
    clearTimeout(pollTimer);
    if (disposed) return;
    if (!document.hidden) {
      try {
        const next = await api("/api/stats");
        const changed = next.historyCount !== stats.value.historyCount
          || next.lastSummary !== stats.value.lastSummary
          || (stats.value.summarizing && !next.summarizing);
        stats.value = next;
        connected.value = true;
        if (changed) await refreshData();
      } catch { connected.value = false; }
    }
    if (!disposed) pollTimer = setTimeout(poll, busy.value ? 4000 : 15000);
  }

  function selectChannel(id) {
    selected.value = id;
    page.value = "workspace";
  }

  watch(selected, () => {
    fetchVersion += 1;
    fetchController?.abort();
    fetching.value = false;
    snapshot.value = null;
  }, { flush: "sync" });

  async function fetchMessages() {
    const channel = currentChannel.value;
    if (!channel || fetching.value) return;
    if (!cfg.discordTokenSet) {
      notify("请先配置 Discord 连接", "error");
      page.value = "settings";
      return;
    }
    const version = ++fetchVersion;
    fetchController = new AbortController();
    fetching.value = true;
    snapshot.value = null;
    try {
      const data = await api("/api/fetch", {
        channelId: channel.id, hours: cfg.hours, limit: cfg.limit,
      }, { signal: fetchController.signal });
      if (version !== fetchVersion) return;
      snapshot.value = captureSnapshot(channel, data);
      notify(data.transcript ? `已拉取 ${data.count} 条消息` : "该范围内没有文本消息", data.transcript ? "success" : "info");
    } catch (error) {
      if (error.name !== "AbortError") notify(error.message, "error");
    } finally {
      if (version === fetchVersion) fetching.value = false;
    }
  }

  async function runTask(kind, operation) {
    if (busy.value) { notify("已有任务在运行中", "info"); return; }
    pending.value = kind;
    try {
      await operation();
    } catch (error) { notify(error.message, "error"); }
    finally {
      pending.value = "";
      try { await refreshData(); } catch { connected.value = false; }
    }
  }

  async function openReport(file, meta = null) {
    const version = ++readerVersion;
    Object.assign(reader, { open: true, loading: true, file, markdown: "", meta });
    try {
      const data = await api("/api/history/" + encodeURIComponent(file));
      if (version === readerVersion) reader.markdown = data.markdown;
    } catch (error) {
      if (version === readerVersion) { reader.open = false; notify(error.message, "error"); }
    } finally { if (version === readerVersion) reader.loading = false; }
  }

  async function summarize() {
    if (!snapshot.value?.transcript) return;
    const payload = summarizePayload(snapshot.value);
    return runTask("summary", async () => {
      const data = await api("/api/summarize", payload);
      await openReport(data.historyFile, { ...payload, reportType: "summary" });
      notify("总结已生成");
    });
  }

  async function rollup() {
    const id = selected.value;
    if (!id) return;
    return runTask("rollup", async () => {
      const data = await api("/api/channel/ai-rollup", { channelId: id });
      await openReport(data.file, { channelId: id, reportType: "rollup" });
      notify(data.unchanged ? "跨期汇总已是最新" : "跨期汇总已更新", data.unchanged ? "info" : "success");
    });
  }

  async function runSchedule() {
    return runTask("schedule", async () => {
      const result = await api("/api/schedule/run", {});
      notify(result.message || "任务已完成");
    });
  }

  async function saveSettings(quiet = false) {
    if (saving.value) return false;
    saving.value = true;
    try {
      const payload = configPayload();
      for (const [key, value] of Object.entries(credentials)) {
        if (value.trim()) payload[key] = value.trim();
      }
      await api("/api/config", payload);
      Object.assign(cfg, await api("/api/config"));
      credentials.discordToken = "";
      credentials.apiKey = "";
      savedConfig.value = JSON.stringify(configPayload());
      if (!quiet) notify("设置已保存");
      await refreshData();
      return true;
    } catch (error) { notify(error.message, "error"); return false; }
    finally { saving.value = false; }
  }

  async function clearCredential(key) {
    try {
      await api("/api/config", { [key]: "" });
      credentials[key] = "";
      cfg[key + "Set"] = false;
      notify("凭据已移除");
    } catch (error) { notify(error.message, "error"); }
  }

  async function loadModels() {
    if (!cfg.apiBase) { notify("请先填写 API Base", "error"); return; }
    modelsLoading.value = true;
    try {
      if (!await saveSettings(true)) return;
      const data = await api("/api/models", {});
      models.value = data.models || [];
      notify(models.value.length ? `已获取 ${models.value.length} 个模型` : "接口返回的模型列表为空", "info");
    } catch (error) { notify(error.message, "error"); }
    finally { modelsLoading.value = false; }
  }

  async function checkChannel(channelId) {
    if (checking.value) return;
    if (!/^\d+$/.test(channelId)) { notify("频道 ID 必须是数字", "error"); return; }
    checking.value = channelId;
    try {
      const info = await api("/api/channel/info?id=" + encodeURIComponent(channelId));
      const next = normalizeChannels(channels.value);
      const existing = next.find(channel => channel.id === channelId);
      if (existing) Object.assign(existing, info);
      else next.push({ id: channelId, ...info });
      await api("/api/config", { channels: next, channelId: cfg.channelId || channelId });
      cfg.channels = next;
      cfg.channelId ||= channelId;
      selected.value ||= channelId;
      newChannel.value = "";
      notify("频道已验证并保存");
    } catch (error) { notify(error.message, "error"); }
    finally { checking.value = ""; }
  }

  async function removeChannel(channelId) {
    const next = normalizeChannels(channels.value).filter(channel => channel.id !== channelId);
    const nextDefault = cfg.channelId === channelId ? next[0]?.id || "" : cfg.channelId;
    try {
      await api("/api/config", { channels: next, channelId: nextDefault });
      cfg.channels = next;
      cfg.channelId = nextDefault;
      if (selected.value === channelId) selected.value = next[0]?.id || "";
      notify("频道已移除，历史报告保留");
    } catch (error) { notify(error.message, "error"); }
  }

  async function deleteReport(file) {
    try {
      await api("/api/history/" + encodeURIComponent(file), undefined, { method: "DELETE" });
      reports.value = reports.value.filter(report => report.file !== file);
      if (reader.file === file) reader.open = false;
      notify("报告已删除");
      await refreshData();
    } catch (error) { notify(error.message, "error"); }
  }

  async function downloadReport(file) {
    try {
      const data = await api("/api/history/" + encodeURIComponent(file));
      downloadMarkdown(data.markdown, file);
    } catch (error) { notify(error.message, "error"); }
  }

  async function copyReport() {
    try { await navigator.clipboard.writeText(reader.markdown); notify("已复制 Markdown"); }
    catch { notify("复制失败", "error"); }
  }

  async function loadKnowledge() {
    const version = ++knowledgeVersion;
    kb.loading = true;
    try {
      const data = await api("/api/kb");
      if (version !== knowledgeVersion) return;
      Object.assign(kb, { exists: true, markdown: data.markdown, size: data.size, pages: data.pages || [], activeFile: "" });
    } catch (error) {
      if (version !== knowledgeVersion) return;
      kb.exists = false;
      kb.markdown = "";
      if (!error.message.includes("尚未生成")) notify(error.message, "error");
    } finally { if (version === knowledgeVersion) kb.loading = false; }
  }

  async function openKnowledgePage(file) {
    const version = ++knowledgeVersion;
    kb.loading = true;
    try {
      const data = await api("/api/kb/page?file=" + encodeURIComponent(file));
      if (version !== knowledgeVersion) return;
      Object.assign(kb, { markdown: data.markdown, size: data.size, activeFile: file });
    } catch (error) {
      if (version === knowledgeVersion) notify(error.message, "error");
    } finally { if (version === knowledgeVersion) kb.loading = false; }
  }

  async function buildKnowledge() {
    return runTask("knowledge", async () => {
      const result = await api("/api/kb/build", {});
      await loadKnowledge();
      notify(result.message);
    });
  }
  watch(page, value => { if (value === "knowledge") loadKnowledge(); });

  onMounted(async () => {
    try {
      Object.assign(cfg, await api("/api/config"));
      savedConfig.value = JSON.stringify(configPayload());
      await refreshData();
      selected.value = channels.value.some(c => c.id === cfg.channelId) ? cfg.channelId : channels.value[0]?.id || "";
    } catch (error) { connected.value = false; notify(error.message, "error"); }
    finally { loading.value = false; pollTimer = setTimeout(poll, 5000); }
  });
  onUnmounted(() => {
    disposed = true;
    clearTimeout(pollTimer);
    clearTimeout(toastTimer);
    fetchController?.abort();
  });

  return {
    cfg, credentials, page, selected, channels, currentChannel, currentReports, currentMessages,
    reports, stats, schedule, pointers, loading, connected, refreshing, fetching, saving, pending,
    snapshot, toast, reader, kb, busy, models, modelsLoading, checking, newChannel, dirty,
    notify, refresh, selectChannel, fetchMessages, summarize, rollup, runSchedule, saveSettings,
    clearCredential, loadModels, checkChannel, removeChannel, openReport, deleteReport,
    downloadReport, copyReport, buildKnowledge, openKnowledgePage, loadKnowledge,
  };
}
