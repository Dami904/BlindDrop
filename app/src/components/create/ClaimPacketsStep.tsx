"use client";

import { useState } from "react";
import { useZamaSDK } from "@zama-fhe/react-sdk";
import { encryptUint64, useSignClaimAuthorization } from "@tokenops/sdk/fhe-airdrop/react";
import type { Address } from "viem";
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
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState<"encrypting" | "signing" | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedFor, setCopiedFor] = useState<string | null>(null);

  const total = recipients.length;
  const done = progress;
  const current = recipients[progress];

  async function generateAll() {
    setError(null);
    setIsRunning(true);
    setPackets([]);
    setProgress(0);

    const results: GeneratedPacket[] = [];
    try {
      for (const recipient of recipients) {
        const amountUnits = scaleAmountToUnits(recipient.amount, 6);

        setStage("encrypting");
        const encryptedInput = await encryptUint64({
          encryptor: toTokenOpsEncryptor(zamaSDK.relayer),
          contractAddress: deployed.airdrop,
          userAddress: recipient.address,
          value: amountUnits,
        });

        setStage("signing");
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

        results.push({ address: recipient.address, packet });
        setPackets([...results]);
        setProgress(results.length);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsRunning(false);
      setStage(null);
    }
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

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-display text-lg">III. Claim packets</h2>
        <p className="mt-1 text-sm" style={{ color: "var(--text-dim)" }}>
          For each recipient, an encrypted allocation is sealed to their address, then
          admin-signed. This runs sequentially and can take a while — each step is a real FHE
          encryption + relayer round-trip. Nothing is sent to a server; packets stay in your browser.
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
          <div
            className={`h-2 w-full overflow-hidden rounded-full ${isRunning ? "fhe-scan" : ""}`}
            style={{ background: "var(--ink-3)" }}
          >
            <div
              className="h-full transition-all"
              style={{
                width: `${total === 0 ? 0 : (done / total) * 100}%`,
                background: "var(--gradient-spectral)",
                boxShadow: isRunning ? "var(--glow-seal)" : "none",
                transitionDuration: "var(--dur-med)",
              }}
            />
          </div>
          <p className="font-data mt-2 text-xs" style={{ color: "var(--text-dim)" }}>
            {isRunning && current ? (
              <>
                {stage === "signing" ? "Signing" : "Encrypting"} allocation {done + 1} of {total} —{" "}
                {shortAddress(current.address)}…
              </>
            ) : (
              <>
                {done} / {total} sealed{isRunning ? "…" : ""}
              </>
            )}
          </p>
        </div>
      )}

      {error && <p className="text-sm" style={{ color: "var(--err)" }}>{error}</p>}

      {packets.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-sm" style={{ color: "var(--text-dim)" }}>
              {packets.length} packet{packets.length === 1 ? "" : "s"} ready
            </p>
            <div className="flex gap-2">
              {!isRunning && packets.length < total && (
                <button type="button" onClick={generateAll} className="btn btn-ghost text-xs">
                  Retry / regenerate
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
