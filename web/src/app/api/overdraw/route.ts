import { NextResponse } from "next/server";

// Retired endpoint: the UI verifies mined refusal receipts instead of exposing a
// server-funded signing action. No environment variables or signing keys are read.
export async function POST() {
  return NextResponse.json({ error: "This endpoint no longer broadcasts transactions. View the mined refusal evidence on the position page." }, { status: 410 });
}
