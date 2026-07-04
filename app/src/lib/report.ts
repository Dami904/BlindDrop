/**
 * Pure, framework-free helpers for building a downloadable campaign
 * completion report (CSV + JSON) from generated claim packets and their
 * last-known on-chain claim status.
 *
 * Kept dependency-free (no csv library) so the serializer is trivially
 * unit-testable, matching the rest of this lib/ directory.
 */

/** On-chain claim status for a single recipient, as of the last manual refresh. */
export type ClaimStatus = "claimed" | "unclaimed" | "unknown";

/** Claim status including the "never refreshed" case, for report rows. */
export type ReportClaimStatus = ClaimStatus | "not-checked";

export interface ReportRecipientRow {
  address: string;
  /** Human decimal amount, e.g. "12.5" — not raw base units. */
  amount: string;
  email?: string;
  claimLink: string;
  status: ReportClaimStatus;
}

export interface ReportMeta {
  campaignAddress: string;
  tokenAddress: string;
  chainId: number;
  /** ISO timestamp, when known (the claim window may not have been set at generation time). */
  claimWindowStart?: string;
  claimWindowEnd?: string;
  /** ISO timestamp of when the report was built. */
  generatedAt: string;
}

/** Human-readable label for a {@link ReportClaimStatus}. */
export function claimStatusLabel(status: ReportClaimStatus): string {
  switch (status) {
    case "claimed":
      return "Claimed";
    case "unclaimed":
      return "Unclaimed";
    case "unknown":
      return "Unknown";
    case "not-checked":
      return "Not checked";
  }
}

/**
 * Escape a single CSV field per RFC 4180: fields containing a comma, quote,
 * or newline are wrapped in quotes, with internal quotes doubled. Fields
 * with none of those characters are returned as-is.
 */
export function csvEscapeField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function csvRow(fields: string[]): string {
  return fields.map(csvEscapeField).join(",");
}

/**
 * Build the full CSV text for a campaign report: `#`-prefixed metadata
 * comment rows, followed by a header row and one row per recipient.
 */
export function buildReportCsv(meta: ReportMeta, rows: ReportRecipientRow[]): string {
  const metaLines = [
    `# campaign,${meta.campaignAddress}`,
    `# token,${meta.tokenAddress}`,
    `# chainId,${meta.chainId}`,
    ...(meta.claimWindowStart ? [`# claimWindowStart,${meta.claimWindowStart}`] : []),
    ...(meta.claimWindowEnd ? [`# claimWindowEnd,${meta.claimWindowEnd}`] : []),
    `# generatedAt,${meta.generatedAt}`,
  ];
  const header = csvRow(["address", "amount", "email", "claimLink", "status"]);
  const body = rows.map((r) =>
    csvRow([r.address, r.amount, r.email ?? "", r.claimLink, claimStatusLabel(r.status)])
  );
  return [...metaLines, header, ...body].join("\n");
}

export interface ReportJson {
  campaignAddress: string;
  tokenAddress: string;
  chainId: number;
  claimWindowStart?: string;
  claimWindowEnd?: string;
  generatedAt: string;
  recipients: Array<{
    address: string;
    amount: string;
    email?: string;
    claimLink: string;
    status: string;
  }>;
}

/** Build the JSON-serializable campaign report object (metadata + per-recipient rows). */
export function buildReportJson(meta: ReportMeta, rows: ReportRecipientRow[]): ReportJson {
  return {
    campaignAddress: meta.campaignAddress,
    tokenAddress: meta.tokenAddress,
    chainId: meta.chainId,
    claimWindowStart: meta.claimWindowStart,
    claimWindowEnd: meta.claimWindowEnd,
    generatedAt: meta.generatedAt,
    recipients: rows.map((r) => ({
      address: r.address,
      amount: r.amount,
      email: r.email,
      claimLink: r.claimLink,
      status: claimStatusLabel(r.status),
    })),
  };
}
