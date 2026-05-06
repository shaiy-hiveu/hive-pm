// Lightweight Slack DM sender used by the PM acute-flag workflow.
// Server-only (uses SLACK_BOT_TOKEN). Failures are reported via the
// returned `ok` flag — callers should treat sending as best-effort and
// never block the primary write path on a Slack outage.

const SLACK_API = "https://slack.com/api";

export type SlackResult = {
  ok: boolean;
  reason?: string;
  ts?: string;
};

export async function sendSlackDM(slackUserId: string, text: string): Promise<SlackResult> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return { ok: false, reason: "SLACK_BOT_TOKEN not configured" };
  if (!slackUserId) return { ok: false, reason: "missing slack_user_id" };

  // Slack DMs are sent by posting to the user id directly — Slack opens
  // (or reuses) the bot↔user IM channel automatically.
  try {
    const res = await fetch(`${SLACK_API}/chat.postMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ channel: slackUserId, text, unfurl_links: false, unfurl_media: false }),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string; ts?: string };
    if (!data.ok) return { ok: false, reason: data.error ?? `HTTP ${res.status}` };
    return { ok: true, ts: data.ts };
  } catch (err: unknown) {
    return { ok: false, reason: err instanceof Error ? err.message : "fetch failed" };
  }
}
