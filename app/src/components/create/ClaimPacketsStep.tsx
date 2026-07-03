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

export function ClaimPacketsStep({ recipients, deployed }: ClaimPacketsStepProps) {
  const zamaSDK = useZamaSDK();
  const sign = useSignClaimAuthorization();

  const [packets, setPackets] = useState<GeneratedPacket[]>([]);
  const [progress, setProgress] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedFor, setCopiedFor] = useState<string | null>(null);

  const total = recipients.length;
  const done = progress;

  async function generateAll() {
    setError(null);
    setIsRunning(true);
    setPackets([]);
    setProgress(0);

    const results: GeneratedPacket[] = [];
    try {
      for (const recipient of recipients) {
        const amountUnits = scaleAmountToUnits(recipient.amount, 6);

        const encryptedInput = await encryptUint64({
          encryptor: toTokenOpsEncryptor(zamaSDK.relayer),
          contractAddress: deployed.airdrop,
          userAddress: recipient.address,
          value: amountUnits,
        });

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
        <h2 className="text-lg font-medium text-zinc-100">3. Claim packets</h2>
        <p className="mt-1 text-sm text-zinc-400">
          For each recipient, an encrypted allocation is created and bound to their address, then
          admin-signed. This runs sequentially and can take a while — each step is a real FHE
          encryption + relayer round-trip. Nothing is sent to a server; packets stay in your browser.
        </p>
      </div>

      {packets.length === 0 && !isRunning && (
        <button
          type="button"
          onClick={generateAll}
          disabled={recipients.length === 0}
          className="w-fit rounded-full bg-emerald-500 px-5 py-2 text-sm font-medium text-black hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Generate {recipients.length} claim packet{recipients.length === 1 ? "" : "s"}
        </button>
      )}

      {(isRunning || packets.length > 0) && (
        <div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full bg-emerald-500 transition-all"
              style={{ width: `${total === 0 ? 0 : (done / total) * 100}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            {done} / {total} generated{isRunning ? "…" : ""}
          </p>
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      {packets.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-400">{packets.length} packet{packets.length === 1 ? "" : "s"} ready</p>
            <div className="flex gap-2">
              {!isRunning && packets.length < total && (
                <button
                  type="button"
                  onClick={generateAll}
                  className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800"
                >
                  Retry / regenerate
                </button>
              )}
              <button
                type="button"
                onClick={downloadAll}
                className="rounded-md bg-zinc-100 px-3 py-1.5 text-sm font-medium text-black hover:bg-white"
              >
                Download all (JSON array)
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900/70 text-left text-zinc-400">
                <tr>
                  <th className="px-3 py-2 font-normal">Recipient</th>
                  <th className="px-3 py-2 font-normal"></th>
                </tr>
              </thead>
              <tbody>
                {packets.map((gp) => (
                  <tr key={gp.address} className="border-t border-zinc-800">
                    <td className="px-3 py-2 font-mono text-xs text-zinc-200">{gp.address}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => copyBase64(gp)}
                          className="text-xs text-emerald-400 hover:text-emerald-300"
                        >
                          {copiedFor === gp.address ? "Copied!" : "Copy as base64"}
                        </button>
                        <button
                          type="button"
                          onClick={() => downloadJson(`claim-packet-${gp.address}.json`, gp.packet)}
                          className="text-xs text-zinc-300 hover:text-zinc-100"
                        >
                          Download JSON
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
