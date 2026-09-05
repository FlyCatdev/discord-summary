#!/usr/bin/env python3
"""Discord channel summarizer - pure REST protocol, no client mod needed.

Reads channel message history with a user token, summarizes via any
OpenAI-compatible endpoint (default: local CPA).

Usage:
  python3 discord_summary.py --channel <CHANNEL_ID> [--hours 24] [--limit 2000]
                             [--api-base http://127.0.0.1:8888/v1]
                             [--api-key sk-xxx] [--model gpt-4o-mini]

Token sources (first hit wins):
  1. --token argument
  2. DISCORD_TOKEN env var
"""

import argparse
import json
import os
import sys
import time
import urllib.request

API_BASE = "https://discord.com/api/v9"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")


def http_json(url, token, params=None):
    if params:
        url += "?" + "&".join(f"{k}={v}" for k, v in params.items())
    req = urllib.request.Request(url, headers={
        "Authorization": token,
        "User-Agent": UA,
        "Accept": "application/json",
    })
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 429:
                retry = float(e.headers.get("Retry-After", "1"))
                print(f"  rate limited, sleep {retry}s", file=sys.stderr)
                time.sleep(retry)
                continue
            raise
    raise RuntimeError("rate limited too many times")


def fetch_messages(channel_id, token, limit, hours):
    """Paginate backwards through history until limit/hours satisfied."""
    out = []
    before = None
    cutoff = time.time() - hours * 3600 if hours > 0 else None
    while len(out) < limit:
        params = {"limit": min(100, limit - len(out))}
        if before:
            params["before"] = before
        batch = http_json(f"{API_BASE}/channels/{channel_id}/messages", token, params)
        if not batch:
            break
        for m in batch:
            ts = _parse_ts(m.get("timestamp"))
            if cutoff and ts < cutoff:
                return list(reversed(out))
            out.append({
                "ts": m.get("timestamp"),
                "author": m["author"].get("global_name") or m["author"]["username"],
                "content": m.get("content", ""),
            })
            if len(out) == limit:
                break
        before = batch[-1]["id"]
        if len(out) >= limit or len(batch) < params["limit"]:
            break
        time.sleep(0.5)
    return list(reversed(out))


def _parse_ts(iso):
    import datetime
    return datetime.datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp()


def render_transcript(messages):
    lines = []
    for m in messages:
        body = m["content"].strip()
        if body:
            lines.append(f"[{m['ts']}] {m['author']}: {body}")
    return "\n".join(lines)


def summarize(transcript, api_base, api_key, model):
    """Call OpenAI-compatible chat completions."""
    prompt = (
        "以下是 Discord 频道一段时间内的聊天记录。请用中文输出结构化总结：\n"
        "## 主要话题\n按话题分点，每点给出核心结论和参与者\n"
        "## 关键信息\n链接/资源/决定/约定单独列出\n"
        "## 金句/有趣发言\n摘录 3-5 条原文\n\n"
        f"聊天记录如下：\n\n{transcript}"
    )
    body = json.dumps({
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
    }).encode()
    req = urllib.request.Request(
        f"{api_base.rstrip('/')}/chat/completions",
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
    )
    with urllib.request.urlopen(req, timeout=300) as r:
        data = json.load(r)
    return data["choices"][0]["message"]["content"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--channel", required=True, help="channel ID")
    ap.add_argument("--token", default=os.environ.get("DISCORD_TOKEN"))
    ap.add_argument("--hours", type=float, default=24, help="time window, 0=all")
    ap.add_argument("--limit", type=int, default=2000, help="max messages")
    ap.add_argument("--save-transcript", default="", help="also dump raw transcript to file")
    ap.add_argument("--api-base", default=os.environ.get("SUMMARY_API_BASE", "http://127.0.0.1:8888/v1"))
    ap.add_argument("--api-key", default=os.environ.get("SUMMARY_API_KEY", ""))
    ap.add_argument("--model", default=os.environ.get("SUMMARY_MODEL", "gpt-4o-mini"))
    args = ap.parse_args()

    if not args.token:
        sys.exit("need --token or DISCORD_TOKEN env")

    print(f"fetching #{args.channel} (last {args.hours}h, cap {args.limit})...", file=sys.stderr)
    msgs = fetch_messages(args.channel, args.token, args.limit, args.hours)
    print(f"got {len(msgs)} messages", file=sys.stderr)

    transcript = render_transcript(msgs)
    if not transcript:
        sys.exit("no text messages in range")
    if args.save_transcript:
        open(args.save_transcript, "w", encoding="utf-8").write(transcript)
        print(f"transcript saved -> {args.save_transcript}", file=sys.stderr)

    # 防超长：粗截断到 ~120k 字符
    if len(transcript) > 120_000:
        transcript = transcript[-120_000:]
        print("transcript truncated to last 120k chars", file=sys.stderr)

    summary = summarize(transcript, args.api_base, args.api_key, args.model)
    print(summary)


if __name__ == "__main__":
    main()
