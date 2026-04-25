// JS backend not used by default, see README for instructions.

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/app/lib/logger";
import { requireAuth } from "@/app/lib/auth/apiAuth";

import { Client } from "langsmith";

export const runtime = "edge";

const client = new Client();

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const { run_id, key = "user_score", ...rest } = body;
    if (!run_id) {
      return NextResponse.json(
        { error: "No LangSmith run ID provided" },
        { status: 400 },
      );
    }

    await client.createFeedback(run_id, key, rest);

    return NextResponse.json(
      { result: "posted feedback successfully" },
      { status: 200 },
    );
  } catch (e: unknown) {
    logger.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const { feedback_id, score, comment } = body;
    if (feedback_id === undefined) {
      return NextResponse.json(
        { error: "No feedback ID provided" },
        { status: 400 },
      );
    }

    await client.updateFeedback(feedback_id, { score, comment });

    return NextResponse.json(
      { result: "patched feedback successfully" },
      { status: 200 },
    );
  } catch (e: unknown) {
    logger.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 });
  }
}
