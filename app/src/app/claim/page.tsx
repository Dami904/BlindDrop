"use client";

import { useCallback, useMemo, useState } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { sepolia } from "wagmi/chains";
import { useClaim } from "@tokenops/sdk/fhe-airdrop/react";
import { isTokenOpsSdkError } from "@tokenops/sdk/fhe-airdrop";
import {
  etherscanAddressUrl,
  etherscanTxUrl,
  isSameAddress,
  isSepoliaChainId,
  parsePacketText,
  SEPOLIA_CHAIN_ID,
  type ClaimPacket,
} from "@/lib/packet";

type LoadState =
  | { kind: "idle" }
  | { kind: "error"; message: string }
  | { kind: "loaded"; packet: ClaimPacket };

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** Turn a raw error (SDK typed error or generic) into a readable message. */
function describeClaimError(error: unknown): string {
  if (isTokenOpsSdkError(error)) {
    switch (error.code) {
      case "TOKENOPS_ALREADY_CLAIMED":
        return "This allocation has already been claimed.";
      case "TOKENOPS_CLAIM_NOT_STARTED":
        return "The claim window hasn't opened yet.";
      case "TOKENOPS_CLAIM_WINDOW_CLOSED":
        return "The claim window has closed.";
      case "TOKENOPS_PAUSED":
        return "Claims are currently paused by the airdrop admin.";
      case "TOKENOPS_INVALID_SIGNATURE":
        return "The claim signature is invalid or malformed. Double-check your claim packet.";
      case "TOKENOPS_INSUFFICIENT_FEE":
        return "The transaction didn't attach enough ETH to cover the gas fee.";
      case "TOKENOPS_WALLET_REJECTED":
      case "TOKENOPS_USER_REJECTED":
        return "You rejected the transaction in your wallet.";
      case "TOKENOPS_WALLET_CHAIN_MISMATCH":
        return "Your wallet is on the wrong network. Switch to Sepolia and try again.";
      case "TOKENOPS_NETWORK_ERROR":
        return "Network error talking to the RPC endpoint. Please try again.";
      case "TOKENOPS_CONTRACT_REVERT":
        return "The transaction reverted on-chain. This allocation may already be claimed or the window may be closed.";
      default:
        return error.message;
    }
  }
  if (error instanceof Error) return error.message;
  return "An unexpected error occurred while submitting the claim.";
}

export default function ClaimPage() {
  const { address, isConnected, chainId } = useAccount();
  const { switchChain, isPending: isSwitching } = useSwitchChain();

  const [pasteText, setPasteText] = useState("");
  const [loadState, setLoadState] = useState<LoadState>({ kind: "idle" });

  const packet = loadState.kind === "loaded" ? loadState.packet : undefined;

  const claim = useClaim({ address: (packet?.airdrop ?? "0x0000000000000000000000000000000000000000") as `0x${string}` });

  const loadFromText = useCallback((raw: string) => {
    const result = parsePacketText(raw);
    if (!result.ok) {
      const message =
        result.error.kind === "empty-input"
          ? "Paste or upload a claim packet first."
          : result.error.kind === "invalid-json"
            ? `Couldn't parse that as JSON or base64 JSON: ${result.error.message}`
            : "That doesn't look like a valid claim packet — check the shape against what your airdrop admin sent you.";
      setLoadState({ kind: "error", message });
      return;
    }
    setLoadState({ kind: "loaded", packet: result.packet });
  }, []);

  const onFileChange = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      const text = await file.text();
      loadFromText(text);
    },
    [loadFromText]
  );

  const recipientMismatch = useMemo(() => {
    if (!packet || !address) return false;
    return !isSameAddress(packet.recipient, address);
  }, [packet, address]);

  const wrongChain = packet ? !isSepoliaChainId(chainId) : false;

  const canSubmit =
    !!packet &&
    isConnected &&
    !recipientMismatch &&
    !wrongChain &&
    !claim.isPending;

  return (
    <div className="mx-auto flex max-w-3xl flex-1 flex-col px-6 py-16">
      <h1 className="text-3xl font-semibold text-zinc-50">Claim Tokens</h1>
      <p className="mt-3 text-zinc-400">
        Load the claim packet your airdrop admin gave you, then submit it from the connected
        wallet it was issued to.
      </p>

      {!isConnected && (
        <div className="mt-8 rounded-xl border border-amber-800/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-300">
          Connect your wallet to continue.
        </div>
      )}

      <section className="mt-8 space-y-4">
        <div>
          <label className="block text-sm font-medium text-zinc-300">
            Upload claim packet (.json)
          </label>
          <input
            type="file"
            accept="application/json,.json,.txt"
            onChange={(e) => void onFileChange(e.target.files?.[0])}
            className="mt-2 block w-full text-sm text-zinc-400 file:mr-4 file:rounded-lg file:border-0 file:bg-zinc-800 file:px-4 file:py-2 file:text-sm file:font-medium file:text-zinc-100 hover:file:bg-zinc-700"
          />
        </div>

        <div className="text-center text-xs uppercase tracking-wide text-zinc-600">or</div>

        <div>
          <label className="block text-sm font-medium text-zinc-300">
            Paste packet JSON or base64
          </label>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={5}
            placeholder='{"version":1,"airdrop":"0x…", …}'
            className="mt-2 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-emerald-600 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => loadFromText(pasteText)}
            className="mt-2 rounded-full bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-700"
          >
            Load packet
          </button>
        </div>

        {loadState.kind === "error" && (
          <div className="rounded-xl border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-300">
            {loadState.message}
          </div>
        )}
      </section>

      {packet && (
        <section className="mt-10 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
          <h2 className="text-lg font-semibold text-zinc-50">Claim summary</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-zinc-400">Airdrop contract</dt>
              <dd>
                <a
                  href={etherscanAddressUrl(packet.airdrop)}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-emerald-400 hover:underline"
                >
                  {shortAddress(packet.airdrop)}
                </a>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-zinc-400">Confidential token</dt>
              <dd>
                <a
                  href={etherscanAddressUrl(packet.token)}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-emerald-400 hover:underline"
                >
                  {shortAddress(packet.token)}
                </a>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-zinc-400">Recipient</dt>
              <dd className="font-mono text-zinc-200">{shortAddress(packet.recipient)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-zinc-400">Status</dt>
              <dd className="text-zinc-200">
                {claim.isSuccess
                  ? "Claimed"
                  : claim.isPending
                    ? "Submitting…"
                    : "Not yet claimed"}
              </dd>
            </div>
          </dl>

          {recipientMismatch && (
            <div className="mt-5 rounded-xl border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-300">
              This packet was issued to <span className="font-mono">{shortAddress(packet.recipient)}</span>,
              but your connected wallet is{" "}
              <span className="font-mono">{address ? shortAddress(address) : "unknown"}</span>. Switch to the
              matching wallet to claim.
            </div>
          )}

          {!recipientMismatch && wrongChain && (
            <div className="mt-5 flex items-center justify-between rounded-xl border border-amber-800/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-300">
              <span>This claim packet is for Sepolia. Switch networks to continue.</span>
              <button
                type="button"
                onClick={() => switchChain({ chainId: sepolia.id })}
                disabled={isSwitching}
                className="ml-4 shrink-0 rounded-full bg-amber-500 px-3 py-1.5 text-xs font-semibold text-black hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSwitching ? "Switching…" : "Switch to Sepolia"}
              </button>
            </div>
          )}

          <div className="mt-6">
            <button
              type="button"
              disabled={!canSubmit}
              onClick={() =>
                claim.mutate({
                  encryptedInput: packet.encryptedInput,
                  signature: packet.signature,
                })
              }
              className="w-full rounded-full bg-emerald-500 px-4 py-3 text-sm font-semibold text-black transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {claim.isPending ? "Claiming…" : "Claim my allocation"}
            </button>
          </div>

          {claim.isError && (
            <div className="mt-4 rounded-xl border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-300">
              {describeClaimError(claim.error)}
            </div>
          )}

          {claim.isSuccess && claim.data && (
            <div className="mt-4 rounded-xl border border-emerald-800/50 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-300">
              Claim submitted.{" "}
              <a
                href={etherscanTxUrl(claim.data)}
                target="_blank"
                rel="noreferrer"
                className="font-mono underline"
              >
                View on Etherscan
              </a>
              <div className="mt-2">
                <a
                  href={`/verify?token=${packet.token}`}
                  className="text-emerald-200 underline underline-offset-2"
                >
                  Verify &amp; decrypt my allocation →
                </a>
              </div>
            </div>
          )}
        </section>
      )}

      <p className="mt-10 text-xs text-zinc-600">
        Claim packets expected on chain ID {SEPOLIA_CHAIN_ID} (Sepolia). Never share your packet's
        signature with anyone other than the airdrop contract — it authorizes a one-time claim.
      </p>
    </div>
  );
}
