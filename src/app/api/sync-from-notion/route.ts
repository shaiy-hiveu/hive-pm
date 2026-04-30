import { NextResponse } from "next/server";
import { syncNotionStatus } from "@/lib/sync-notion-status";

export async function POST() {
  try {
    const result = await syncNotionStatus();
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("sync-from-notion error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
