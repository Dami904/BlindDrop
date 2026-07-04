"use client";

import { useState } from "react";
import { useZamaSDK } from "@zama-fhe/react-sdk";
import { encryptUint64, useSignClaimAuthorization } from "@tokenops/sdk/fhe-airdrop/react";
import type { Address, Hex } from "viem";
import { SEPOLIA_CHAIN_ID, type ClaimPacket } from "@/lib/packet";
import { scaleAmountToUnits, type RecipientRow } from "@/lib/csv";
import { toTokenOpsEncryptor } from "@/lib/encryptor";
import type { DeployedCampaign } from "@/components/create/CampaignStep";

interface ClaimPacketsStepProps {
  recipients: RecipientRow[];
  deployed: DeployedCampaign;
}

interface GeneratedPacket {
  address: Address;
  packet: ClaimPacket;
}

interface EncryptFailure {
  recipient: RecipientRow;
  message: string;
}

/** How many concurrent relayer encryption requests to run at once — bounded so
 * a large recipient list doesn't fire hundreds of simultaneous requests. */
const ENCRYPT_CONCURRENCY = 5;

/**
 * Tiny inline promise pool: runs `worker` over `items` with at most
 * `concurrency` in flight at a time. Per-item failures are reported via
 * `onSettle` rather than rejecting the whole pool, so one bad recipient
 * doesn't abort encryption for the rest of the batch.
 */
async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
  onSettle: (item: T, result: { ok: true; value: R } | { ok: false; error: unknown }) => void
): Promise<void> {
  let cursor = 0;
  async function runNext(): Promise<void> {
    while (cursor < items.length) {
      const item = items[cursor++];
      try {
        const value = await worker(item);
        onSettle(item, { ok: true, value });
      } catch (error) {
        onSettle(item, { ok: false, error });
      }
    }
  }
  const poolSize = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: poolSize }, runNext));
}

function toBase64(json: string): string {
  if (typeof btoa === "function") {
    return btoa(unescape(encodeURIComponent(json)));
  }
  return Buffer.from(json, "utf-8").toString("base64");
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function ClaimPacketsStep({ recipients, deployed }: ClaimPacketsStepProps) {
  const zamaSDK = useZamaSDK();
  const sign = useSignClaimAuthorization();

  const [packets, setPackets] = useState<GeneratedPacket[]>([]);
  const [stage, setStage] = useState<"encrypting" | "signing" | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedFor, setCopiedFor] = useState<string | null>(null);

  // Stage 1 (encryption) is parallelized, so its progress is just a settled
  // count — there's no single "current recipient" while several requests
  // are in flight at once.
  const [encryptTotal, setEncryptTotal] = useState(0);
  const [encryptSettled, setEncryptSettled] = useState(0);
  const [encryptFailures, setEncryptFailures] = useState<EncryptFailure[]>([]);

  // Stage 2 (signing) is sequential — only one wallet popup can show at a
  // time — so it does track a "current recipient" like before.
  const [signTotal, setSignTotal] = useState(0);
  const [signProgress, setSignProgress] = useState(0);
  const [signingCurrent, setSigningCurrent] = useState<RecipientRow | null>(null);

  const total = recipients.length;
  const packetsByAddress = new Map(packets.map((p) => [p.address.toLowerCase(), p]));
  const remaining = recipients.filter((r) => !packetsByAddress.has(r.address.toLowerCase()));

  /**
   * Runs the two-stage pipeline over `targets` (defaults to every recipient
   * without a packet yet — i.e. a fresh run, or only the previously-failed
   * ones when called from "Retry failed"). Encryption results are collected
   * first (in parallel, bounded concurrency); only recipients that encrypted
   * successfully move on to sequential signing. Already-generated packets
   * from a prior run are kept, not discarded.
   */
  async function generate(targets: RecipientRow[]) {
    if (targets.length === 0) return;
    setError(null);
    setIsRunning(true);
    setEncryptFailures([]);
    setEncryptTotal(targets.length);
    setEncryptSettled(0);
    setSignTotal(0);
    setSignProgress(0);
    setSigningCurrent(null);

    try {
      // --- Stage 1: encrypt allocations in parallel (bounded concurrency) ---
      setStage("encrypting");
      const encrypted = new Map<string, { handle: Hex; inputProof: Hex }>();
      const failures: EncryptFailure[] = [];

      await runWithConcurrency(
        targets,
        ENCRYPT_CONCURRENCY,
        async (recipient) => {
          const amountUnits = scaleAmountToUnits(recipient.amount, 6);
          return encryptUint64({
            encryptor: toTokenOpsEncryptor(zamaSDK.relayer),
            contractAddress: deployed.airdrop,
            userAddress: recipient.address,
            value: amountUnits,
          });
        },
        (recipient, result) => {
          if (result.ok) {
            encrypted.set(recipient.address.toLowerCase(), {
              handle: result.value.handle,
              inputProof: result.value.inputProof,
            });
          } else {
            failures.push({
              recipient,
              message: result.error instanceof Error ? result.error.message : String(result.error),
            });
          }
          setEncryptSettled((n) => n + 1);
        }
      );

      setEncryptFailures(failures);

      // --- Stage 2: sign authorizations one at a time (wallet-gated) ---
      const toSign = targets.filter((r) => encrypted.has(r.address.toLowerCase()));
      setStage("signing");
      setSignTotal(toSign.length);

      const newPackets: GeneratedPacket[] = [];
      for (const recipient of toSign) {
        setSigningCurrent(recipient);
        const encryptedInput = encrypted.get(recipient.address.toLowerCase())!;

        const signature = await sign.mutateAsync({
          airdropAddress: deployed.airdrop,
          recipient: recipient.address,
          encryptedAmountHandle: encryptedInput.handle,
        });

        const packet: ClaimPacket = {
          version: 1,
          airdrop: deployed.airdrop,
          chainId: SEPOLIA_CHAIN_ID,
          token: deployed.token,
          recipient: recipient.address,
          encryptedInput: {
            handle: encryptedInput.handle,
            inputProof: encryptedInput.inputProof,
          },
          signature,
        };

        newPackets.push({ address: recipient.address, packet });
        setSignProgress((n) => n + 1);
        setPackets((prev) => {
          const byAddress = new Map(prev.map((p) => [p.address.toLowerCase(), p]));
          byAddress.set(recipient.address.toLowerCase(), { address: recipient.address, packet });
          return Array.from(byAddress.values());
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsRunning(false);
      setStage(null);
      setSigningCurrent(null);
    }
  }

  function generateAll() {
    setPackets([]);
    void generate(recipients);
  }

  function retryFailed() {
    void generate(encryptFailures.map((f) => f.recipient));
  }

  function copyBase64(gp: GeneratedPacket) {
    const b64 = toBase64(JSON.stringify(gp.packet));
    navigator.clipboard?.writeText(b64);
    setCopiedFor(gp.address);
    setTimeout(() => setCopiedFor((c) => (c === gp.address ? null : c)), 1500);
  }

  function downloadAll() {
    downloadJson(`claim-packets-${deployed.airdrop}.json`, packets.map((p) => p.packet));
  }

  const encryptDone = stage === null || stage === "signing";

  return (
    <div className="flex flex-col gap-8">
      <div>
        <div className="flex items-center gap-3">
          <span className="seal-badge" data-state="active">
            3
          </span>
          <h2 className="font-display text-lg">Claim packets</h2>
        </div>
        <p className="mt-2 ml-10 text-sm" style={{ color: "var(--text-dim)" }}>
          For each recipient, an encrypted allocation is sealed to their address, then
          admin-signed. Encryption runs in parallel (a few relayer round-trips at once); signing
          happens one at a time — each authorization is individually signed by your wallet, so
          approve each prompt as it appears. Nothing is sent to a server; packets stay in your
          browser.
        </p>
      </div>

      {packets.length === 0 && !isRunning && (
        <button
          type="button"
          onClick={generateAll}
          disabled={recipients.length === 0}
          className="btn btn-seal w-fit"
        >
          Seal {recipients.length} claim packet{recipients.length === 1 ? "" : "s"}
        </button>
      )}

      {(isRunning || packets.length > 0) && (
        <div>
          <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--ink-3)" }}>
            <div
              className="h-full transition-all"
              style={{
                width: `${total === 0 ? 0 : (packets.length / total) * 100}%`,
                background: "linear-gradient(90deg, var(--seal), var(--gold))",
                transitionDuration: "var(--dur-med)",
              }}
            />
          </div>
          <p className="font-data mt-2 text-xs" style={{ color: "var(--text-dim)" }}>
            {isRunning && stage === "encrypting" && (
              <>Encrypting allocations… {encryptSettled}/{encryptTotal}</>
            )}
            {isRunning && stage === "signing" && signingCurrent && (
              <>
                Signing authorization {signProgress + 1} of {signTotal} —{" "}
                {shortAddress(signingCurrent.address)}…
              </>
            )}
            {!isRunning && (
              <>
                {packets.length} / {total} sealed
              </>
            )}
          </p>
        </div>
      )}

      {error && <p className="text-sm" style={{ color: "var(--err)" }}>{error}</p>}

      {!isRunning && encryptDone && encryptFailures.length > 0 && (
        <div className="callout callout-warn callout-col">
          <p>
            {encryptFailures.length} recipient{encryptFailures.length === 1 ? "" : "s"} failed to encrypt and{" "}
            {encryptFailures.length === 1 ? "wasn't" : "weren't"} signed:
          </p>
          <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs">
            {encryptFailures.map((f) => (
              <li key={f.recipient.address}>
                {shortAddress(f.recipient.address)}: {f.message}
              </li>
            ))}
          </ul>
          <button type="button" onClick={retryFailed} className="btn btn-gold mt-3 w-fit text-xs">
            Retry failed encryption{encryptFailures.length === 1 ? "" : "s"}
          </button>
        </div>
      )}

      {packets.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-sm" style={{ color: "var(--text-dim)" }}>
              {packets.length} packet{packets.length === 1 ? "" : "s"} ready
            </p>
            <div className="flex gap-2">
              {!isRunning && remaining.length > 0 && encryptFailures.length === 0 && (
                <button type="button" onClick={() => void generate(remaining)} className="btn btn-ghost text-xs">
                  Generate remaining
                </button>
              )}
              <button type="button" onClick={downloadAll} className="btn btn-gold text-xs">
                Download all (JSON array)
              </button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {packets.map((gp) => (
              <div key={gp.address} className="envelope-card">
                <div className="envelope-flap" aria-hidden />
                <div className="relative z-10 p-4 pt-12">
                  <p className="eyebrow">Sealed packet</p>
                  <p className="font-data mt-1 break-all text-xs" style={{ color: "var(--text)" }}>
                    {gp.address}
                  </p>
                  <div className="mt-3 flex gap-3">
                    <button
                      type="button"
                      onClick={() => copyBase64(gp)}
                      className="link-gold text-xs"
                    >
                      {copiedFor === gp.address ? "Copied!" : "Copy as base64"}
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadJson(`claim-packet-${gp.address}.json`, gp.packet)}
                      className="text-xs"
                      style={{ color: "var(--text-dim)" }}
                    >
                      Download JSON
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
