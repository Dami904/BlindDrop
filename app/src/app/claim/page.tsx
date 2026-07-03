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
  const [isDragging, setIsDragging] = useState(false);

  const packet = loadState.kind === "loaded" ? loadState.packet : undefined;

  const claim = useClaim({ address: (packet?.airdrop ?? "0x0000000000000000000000000000000000000000") as `0x${string}` });

  const loadFromText = useCallback((raw: string) => {
    const result = parsePacketText(raw);
    if (!result.ok) {
      const message =
        result.error.kind === "empty-input"
          ? "Drop or paste a claim packet first."
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
      <p className="eyebrow">Recipient intake</p>
      <h1 className="font-display mt-2 text-3xl">Claim Tokens</h1>
      <p className="mt-3" style={{ color: "var(--text-dim)" }}>
        Open the claim packet your airdrop admin gave you, then submit it from the connected
        wallet it was issued to.
      </p>

      {!isConnected && (
        <div className="callout callout-warn mt-8">Connect your wallet to continue.</div>
      )}

      <section className="mt-8 space-y-4">
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            void onFileChange(e.dataTransfer.files?.[0]);
          }}
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[var(--r-lg)] border-2 border-dashed px-6 py-12 text-center transition-colors"
          style={{
            borderColor: isDragging ? "var(--gold)" : "var(--line-strong)",
            background: isDragging ? "var(--gold-dim)" : "var(--ink-2)",
          }}
        >
          <EnvelopeIcon />
          <p className="font-display text-base">Drop your claim packet here</p>
          <p className="text-xs" style={{ color: "var(--text-dim)" }}>
            .json file, or click to browse
          </p>
          <input
            type="file"
            accept="application/json,.json,.txt"
            onChange={(e) => void onFileChange(e.target.files?.[0])}
            className="sr-only"
          />
        </label>

        <div className="flex items-center gap-3 text-xs" style={{ color: "var(--text-faint)" }}>
          <span className="h-px flex-1" style={{ background: "var(--line)" }} />
          or paste it
          <span className="h-px flex-1" style={{ background: "var(--line)" }} />
        </div>

        <div>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={5}
            placeholder='{"version":1,"airdrop":"0x…", …}'
            className="field font-data text-xs"
          />
          <button type="button" onClick={() => loadFromText(pasteText)} className="btn btn-ghost mt-2">
            Load packet
          </button>
        </div>

        {loadState.kind === "error" && <div className="callout callout-err">{loadState.message}</div>}
      </section>

      {packet && (
        <section className="envelope-card mt-10">
          <div className="envelope-flap" aria-hidden />
          <div className="relative z-10 p-6 pt-14">
            <h2 className="font-display text-lg">Claim summary</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt style={{ color: "var(--text-dim)" }}>Airdrop contract</dt>
                <dd>
                  <a
                    href={etherscanAddressUrl(packet.airdrop)}
                    target="_blank"
                    rel="noreferrer"
                    className="link-gold font-data"
                  >
                    {shortAddress(packet.airdrop)}
                  </a>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt style={{ color: "var(--text-dim)" }}>Confidential token</dt>
                <dd>
                  <a
                    href={etherscanAddressUrl(packet.token)}
                    target="_blank"
                    rel="noreferrer"
                    className="link-gold font-data"
                  >
                    {shortAddress(packet.token)}
                  </a>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt style={{ color: "var(--text-dim)" }}>Recipient</dt>
                <dd className="font-data" style={{ color: "var(--text)" }}>
                  {shortAddress(packet.recipient)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt style={{ color: "var(--text-dim)" }}>Status</dt>
                <dd style={{ color: "var(--text)" }}>
                  {claim.isSuccess ? "Claimed" : claim.isPending ? "Submitting…" : "Not yet claimed"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt style={{ color: "var(--text-dim)" }}>Allocation</dt>
                <dd>
                  <span className="redaction px-2 py-0.5 text-sm">sealed</span>
                </dd>
              </div>
            </dl>

            {recipientMismatch && (
              <div className="callout callout-err mt-5">
                This packet was issued to <span className="font-data">{shortAddress(packet.recipient)}</span>,
                but your connected wallet is{" "}
                <span className="font-data">{address ? shortAddress(address) : "unknown"}</span>. Switch to the
                matching wallet to claim.
              </div>
            )}

            {!recipientMismatch && wrongChain && (
              <div className="callout callout-warn callout-between mt-5">
                <span>This claim packet is for Sepolia. Switch networks to continue.</span>
                <button
                  type="button"
                  onClick={() => switchChain({ chainId: sepolia.id })}
                  disabled={isSwitching}
                  className="btn btn-gold ml-4 shrink-0 text-xs"
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
                className="btn btn-seal w-full py-3"
              >
                {claim.isPending ? "Breaking the seal…" : "Claim my allocation"}
              </button>
            </div>

            {claim.isError && <div className="callout callout-err mt-4">{describeClaimError(claim.error)}</div>}

            {claim.isSuccess && claim.data && (
              <div className="callout callout-ok callout-col mt-4">
                <span>
                  Claim submitted.{" "}
                  <a href={etherscanTxUrl(claim.data)} target="_blank" rel="noreferrer" className="font-data underline">
                    View on Etherscan
                  </a>
                </span>
                <a href={`/verify?token=${packet.token}`} className="link-gold mt-2">
                  Verify &amp; decrypt my allocation →
                </a>
              </div>
            )}
          </div>
        </section>
      )}

      <p className="mt-10 text-xs" style={{ color: "var(--text-faint)" }}>
        Claim packets expected on chain ID {SEPOLIA_CHAIN_ID} (Sepolia). Never share your packet's
        signature with anyone other than the airdrop contract — it authorizes a one-time claim.
      </p>
    </div>
  );
}

function EnvelopeIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden>
      <rect x="3" y="8" width="34" height="24" rx="2" stroke="var(--gold)" strokeWidth="1.5" />
      <path d="M4 9.5 20 22 36 9.5" stroke="var(--gold)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
