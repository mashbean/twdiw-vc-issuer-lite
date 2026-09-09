// The monitor's events as a feed, so following this ecosystem does not require
// remembering to open a web page. Two formats because readers are split: JSON
// Feed for newer clients, Atom for everything else.
//
// Only events are published — the diffs, not the raw daily readings. A feed
// that emitted "everything is still fine" once a day would train its readers to
// ignore it.

import type { MonitorEvent } from "./monitor";

function escapeXML(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** A stable id for an event, so a reader does not show it twice. */
function eventId(origin: string, event: MonitorEvent): string {
  return `${origin}/monitor#${event.at}-${event.kind}-${event.target}`;
}

export function jsonFeed(origin: string, events: MonitorEvent[]): string {
  return JSON.stringify({
    version: "https://jsonfeed.org/version/1.1",
    title: "數位憑證皮夾生態系監測",
    home_page_url: `${origin}/monitor`,
    feed_url: `${origin}/monitor/feed.json`,
    description: "官方信任清單、撤銷清單、鏈上登錄與 API 健康度的每日變更。",
    language: "zh-Hant",
    items: events.map((event) => ({
      id: eventId(origin, event),
      url: `${origin}/monitor`,
      title: event.summary,
      content_text: event.detail ? `${event.summary}\n\n${event.detail}` : event.summary,
      date_published: new Date(event.at).toISOString(),
      tags: [event.kind, event.target],
    })),
  }, null, 2);
}

export function atomFeed(origin: string, events: MonitorEvent[]): string {
  const updated = new Date(events[0]?.at ?? Date.now()).toISOString();
  const entries = events.map((event) => `  <entry>
    <id>${escapeXML(eventId(origin, event))}</id>
    <title>${escapeXML(event.summary)}</title>
    <updated>${new Date(event.at).toISOString()}</updated>
    <link href="${escapeXML(`${origin}/monitor`)}"/>
    <category term="${escapeXML(event.kind)}"/>
    <content type="text">${escapeXML(event.detail ? `${event.summary}\n\n${event.detail}` : event.summary)}</content>
  </entry>`).join("\n");

  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="zh-Hant">
  <id>${escapeXML(`${origin}/monitor/feed.xml`)}</id>
  <title>數位憑證皮夾生態系監測</title>
  <subtitle>官方信任清單、撤銷清單、鏈上登錄與 API 健康度的每日變更。</subtitle>
  <updated>${updated}</updated>
  <link href="${escapeXML(`${origin}/monitor`)}"/>
  <link rel="self" href="${escapeXML(`${origin}/monitor/feed.xml`)}"/>
${entries}
</feed>
`;
}
