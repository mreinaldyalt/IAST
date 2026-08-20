import { NextRequest, NextResponse } from 'next/server';
import { ensureOfficialHistoryInitialized } from '@/lib/officialHistory/bootstrap';
import { fetchAndValidateCandidate } from '@/lib/officialHistory/fetchAndValidate';
import { upsertRecord, loadAllRecords } from '@/lib/officialHistory/store';
import { getProviderForCountry } from '@/lib/officialHistory/providers';
import { VerificationStatus } from '@/lib/officialHistory/types';

/**
 * Fallback admin endpoint — NOT a replacement for the auto-updater, only the
 * safety net for when a source's structure changes or a year needs entering
 * before any auto-checkable URL exists. This project has no user/auth system
 * at all (no login, no session, no user table), so a public admin UI page
 * would be unsafe by construction. Instead this is a server-only JSON
 * endpoint gated by a shared secret (ADMIN_HISTORY_SECRET in .env.local,
 * never committed) — the lightest mechanism that doesn't require inventing
 * an auth system this project doesn't have.
 *
 * Fails CLOSED: if the secret isn't configured at all, every request is
 * rejected — there is no "open" default.
 */
function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.ADMIN_HISTORY_SECRET;
  if (!secret) return false;
  const header = request.headers.get('authorization') || '';
  return header === `Bearer ${secret}`;
}

const VALID_STATUSES: VerificationStatus[] = ['pending', 'candidate', 'verified', 'rejected'];

/** List current records — filterable by ?countryCode=ID */
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  ensureOfficialHistoryInitialized();

  const { searchParams } = new URL(request.url);
  const countryCode = searchParams.get('countryCode');
  const all = loadAllRecords();
  const filtered = countryCode ? all.filter((r) => r.countryCode === countryCode.toUpperCase()) : all;
  return NextResponse.json({ records: filtered });
}

/**
 * Two modes, chosen by which fields are present in the body:
 *
 * 1. Auto-validate a candidate URL (recommended — reduces manual typing/error):
 *    { countryCode, gregorianYear, sourceUrl }
 *
 * 2. Direct manual entry (for sources with no fetchable/parseable webpage,
 *    e.g. citing a PDF or press-conference transcript):
 *    { countryCode, gregorianYear, hijriYear, officialDate, sourceTitle,
 *      sourceUrl, sourceType, verificationStatus, authority, institution }
 *    `verificationStatus` must be explicit — a human admin asserting
 *    "verified" here is exactly what this fallback exists for.
 */
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  ensureOfficialHistoryInitialized();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const countryCode = typeof body.countryCode === 'string' ? body.countryCode.toUpperCase() : null;
  const gregorianYear = typeof body.gregorianYear === 'number' ? body.gregorianYear : null;
  if (!countryCode || !gregorianYear) {
    return NextResponse.json({ error: 'countryCode and gregorianYear are required' }, { status: 400 });
  }

  const provider = getProviderForCountry(countryCode);
  if (!provider) {
    return NextResponse.json({ error: `Country ${countryCode} is not supported` }, { status: 400 });
  }

  const hasManualStatus = typeof body.verificationStatus === 'string';
  const hasSourceUrlOnly = typeof body.sourceUrl === 'string' && !hasManualStatus;

  if (hasSourceUrlOnly) {
    const record = await fetchAndValidateCandidate(countryCode, gregorianYear, body.sourceUrl as string);
    return NextResponse.json({ record });
  }

  if (hasManualStatus) {
    const status = body.verificationStatus as string;
    if (!VALID_STATUSES.includes(status as VerificationStatus)) {
      return NextResponse.json({ error: `verificationStatus must be one of ${VALID_STATUSES.join(', ')}` }, { status: 400 });
    }
    if (status === 'verified' && typeof body.officialDate !== 'string') {
      return NextResponse.json({ error: 'officialDate is required when verificationStatus is "verified"' }, { status: 400 });
    }

    const record = upsertRecord({
      countryCode,
      gregorianYear,
      hijriYear: typeof body.hijriYear === 'number' ? body.hijriYear : null,
      officialDate: typeof body.officialDate === 'string' ? body.officialDate : null,
      authority: typeof body.authority === 'string' ? body.authority : provider.authority,
      institution: typeof body.institution === 'string' ? body.institution : provider.institution,
      sourceTitle: typeof body.sourceTitle === 'string' ? body.sourceTitle : null,
      sourceUrl: typeof body.sourceUrl === 'string' ? body.sourceUrl : null,
      sourceType: typeof body.sourceType === 'string' ? body.sourceType : 'official_isbat_announcement',
      verificationStatus: status as VerificationStatus,
      rejectionReason: typeof body.rejectionReason === 'string' ? body.rejectionReason : null,
      verifiedBy: 'admin-manual',
      lastCheckedAt: new Date().toISOString(),
    });
    return NextResponse.json({ record });
  }

  return NextResponse.json(
    { error: 'Provide either { sourceUrl } for auto-validation, or a full manual record with verificationStatus.' },
    { status: 400 }
  );
}
