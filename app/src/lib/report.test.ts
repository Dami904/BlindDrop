import { describe, expect, it } from "vitest";
import {
  buildReportCsv,
  buildReportJson,
  claimStatusLabel,
  csvEscapeField,
  type ReportMeta,
  type ReportRecipientRow,
} from "./report";

describe("claimStatusLabel", () => {
  it("maps every status to a human label", () => {
    expect(claimStatusLabel("claimed")).toBe("Claimed");
    expect(claimStatusLabel("unclaimed")).toBe("Unclaimed");
    expect(claimStatusLabel("unknown")).toBe("Unknown");
    expect(claimStatusLabel("not-checked")).toBe("Not checked");
  });
});

describe("csvEscapeField", () => {
  it("returns plain fields unchanged", () => {
    expect(csvEscapeField("0xabc")).toBe("0xabc");
    expect(csvEscapeField("12.5")).toBe("12.5");
    expect(csvEscapeField("")).toBe("");
  });

  it("quotes and doubles internal quotes when a field contains a comma", () => {
    expect(csvEscapeField("a,b")).toBe('"a,b"');
  });

  it("quotes and doubles internal double-quote characters", () => {
    expect(csvEscapeField('say "hi"')).toBe('"say ""hi"""');
  });

  it("quotes fields containing newlines", () => {
    expect(csvEscapeField("line1\nline2")).toBe('"line1\nline2"');
    expect(csvEscapeField("line1\r\nline2")).toBe('"line1\r\nline2"');
  });
});

const meta: ReportMeta = {
  campaignAddress: "0x1111111111111111111111111111111111111111",
  tokenAddress: "0x2222222222222222222222222222222222222222",
  chainId: 11155111,
  generatedAt: "2026-07-04T00:00:00.000Z",
};

const rows: ReportRecipientRow[] = [
  {
    address: "0x3333333333333333333333333333333333333333",
    amount: "12.5",
    email: "a@example.com",
    claimLink: "https://example.com/claim#pkt=abc",
    status: "claimed",
  },
  {
    address: "0x4444444444444444444444444444444444444444",
    amount: "1",
    claimLink: "https://example.com/claim#pkt=def",
    status: "not-checked",
  },
];

describe("buildReportCsv", () => {
  it("emits metadata as # comment rows, then a header row, then one row per recipient", () => {
    const csv = buildReportCsv(meta, rows);
    const lines = csv.split("\n");
    expect(lines[0]).toBe(`# campaign,${meta.campaignAddress}`);
    expect(lines[1]).toBe(`# token,${meta.tokenAddress}`);
    expect(lines[2]).toBe(`# chainId,${meta.chainId}`);
    expect(lines[3]).toBe(`# generatedAt,${meta.generatedAt}`);
    expect(lines[4]).toBe("address,amount,email,claimLink,status");
    expect(lines[5]).toBe(
      `${rows[0].address},12.5,a@example.com,https://example.com/claim#pkt=abc,Claimed`
    );
    expect(lines[6]).toBe(`${rows[1].address},1,,https://example.com/claim#pkt=def,Not checked`);
  });

  it("includes claim window rows only when provided", () => {
    const withWindow = buildReportCsv(
      { ...meta, claimWindowStart: "2026-01-01T00:00:00.000Z", claimWindowEnd: "2026-02-01T00:00:00.000Z" },
      []
    );
    expect(withWindow).toContain("# claimWindowStart,2026-01-01T00:00:00.000Z");
    expect(withWindow).toContain("# claimWindowEnd,2026-02-01T00:00:00.000Z");

    const withoutWindow = buildReportCsv(meta, []);
    expect(withoutWindow).not.toContain("claimWindowStart");
    expect(withoutWindow).not.toContain("claimWindowEnd");
  });
});

describe("buildReportJson", () => {
  it("shapes metadata and recipients as plain JSON-serializable data", () => {
    const json = buildReportJson(meta, rows);
    expect(json.campaignAddress).toBe(meta.campaignAddress);
    expect(json.tokenAddress).toBe(meta.tokenAddress);
    expect(json.chainId).toBe(11155111);
    expect(json.generatedAt).toBe(meta.generatedAt);
    expect(json.recipients).toHaveLength(2);
    expect(json.recipients[0]).toEqual({
      address: rows[0].address,
      amount: "12.5",
      email: "a@example.com",
      claimLink: rows[0].claimLink,
      status: "Claimed",
    });
    expect(json.recipients[1].status).toBe("Not checked");
    expect(json.recipients[1].email).toBeUndefined();
  });
});
