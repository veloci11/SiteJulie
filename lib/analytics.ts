import type { BeforeSendEvent } from "@vercel/analytics/next";

/** No admin/API events, query strings, fragments or form data in analytics. */
export function publicAnalyticsEvent(event: BeforeSendEvent) {
  const url = new URL(event.url);
  if (/^\/(admin|api)(\/|$)/.test(url.pathname)) return null;
  url.search = "";
  url.hash = "";
  return { ...event, url: url.toString() };
}
