export function normalizeChannels(channels = []) {
  const unique = new Map();
  for (const channel of channels) {
    const item = typeof channel === "string" ? { id: channel } : channel;
    if (!item?.id || unique.has(String(item.id))) continue;
    unique.set(String(item.id), {
      id: String(item.id), name: item.name || "", guild: item.guild || "",
    });
  }
  return [...unique.values()];
}

export function captureSnapshot(channel, response) {
  return Object.freeze({
    channelId: channel.id,
    channelName: channel.name || channel.id,
    transcript: response.transcript || "",
    timeRange: response.timeRange || "",
    count: response.count || 0,
    preview: response.preview || [],
  });
}

export function summarizePayload(snapshot) {
  if (!snapshot?.channelId || !snapshot.transcript?.trim()) {
    throw new Error("没有可总结的消息");
  }
  const { channelId, channelName, transcript, timeRange, count } = snapshot;
  return { channelId, channelName, transcript, timeRange, count };
}

export function selectReports(reports, { channelId = "", kind = "", query = "" } = {}) {
  const search = query.trim().toLocaleLowerCase();
  return reports.filter(report =>
    (!channelId || report.channelId === channelId)
    && (!kind || report.reportType === kind)
    && (!search || [report.channelName, report.channelId, report.generatedAt, report.timeRange, report.file]
      .some(value => String(value || "").toLocaleLowerCase().includes(search))),
  );
}

export function formatNumber(value = 0) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

export function chartTicks(count, width) {
  if (count <= 1) return count ? [0] : [];
  const ticks = Math.min(count, Math.max(2, Math.floor(width / 64)));
  return Array.from({ length: ticks }, (_, index) => Math.round(index * (count - 1) / (ticks - 1)));
}
