"use client";
import { Analytics } from "@vercel/analytics/next";
import { publicAnalyticsEvent } from "@/lib/analytics";
import { usePathname } from "next/navigation";

export function PublicAnalytics() {
  const pathname = usePathname();
  if (/^\/(admin|api)(\/|$)/.test(pathname)) return null;
  return <Analytics beforeSend={publicAnalyticsEvent} />;
}
