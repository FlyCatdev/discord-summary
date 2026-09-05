export async function api(path, body, options = {}) {
  const response = await fetch(path, {
    ...options,
    method: options.method || (body === undefined ? "GET" : "POST"),
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => {
    throw new Error("服务返回了无法读取的响应");
  });
  if (!response.ok || data.error) throw new Error(data.error || `请求失败 (${response.status})`);
  return data;
}

export function downloadMarkdown(markdown, filename) {
  const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
