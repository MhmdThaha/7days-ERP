import { NextResponse } from 'next/server';

/**
 * TEMPORARY — stores recent LOGIN_TRACE beacons for mobile diagnosis.
 * Remove with login-trace instrumentation after investigation.
 */

type TraceEntry = {
  t: number;
  step: string;
  source: string;
  data?: Record<string, unknown>;
  receivedAt: number;
  userAgent?: string | null;
};

const MAX_ENTRIES = 200;

// Best-effort in-memory buffer (same warm instance only).
const buffer: TraceEntry[] = [];

export async function POST(request: Request) {
  let body: Omit<TraceEntry, 'receivedAt' | 'userAgent'>;

  try {
    body = (await request.json()) as Omit<TraceEntry, 'receivedAt' | 'userAgent'>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const entry: TraceEntry = {
    ...body,
    receivedAt: Date.now(),
    userAgent: request.headers.get('user-agent'),
  };

  buffer.push(entry);
  if (buffer.length > MAX_ENTRIES) {
    buffer.splice(0, buffer.length - MAX_ENTRIES);
  }

  console.log(
    '[LOGIN_TRACE]',
    entry.step,
    entry.source,
    entry.data ?? '',
    entry.userAgent?.slice(0, 80) ?? '',
  );

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({
    count: buffer.length,
    entries: buffer.slice(-50),
  });
}
