// app/api/availability/route.ts
// Minimal API stub for Phase 1. This will later save to a database.

import { NextResponse } from 'next/server';

// Health check / demo GET
export async function GET() {
  return NextResponse.json({ ok: true, message: 'availability endpoint ready' });
}

// Echo POST: accepts JSON and echoes it back
export async function POST(req: Request) {
  try {
    const data = await req.json();
    return NextResponse.json({ ok: true, receivedAt: new Date().toISOString(), data });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: 'Invalid JSON body' },
      { status: 400 }
    );
  }
}
