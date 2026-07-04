"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { sepolia } from "wagmi/chains";
import { useClaim, useGetClaimAmount } from "@tokenops/sdk/fhe-airdrop/react";
import { isTokenOpsSdkError } from "@tokenops/sdk/fhe-airdrop";
import { useDecryptValues, useMetadata } from "@zama-fhe/react-sdk";
import {
  etherscanAddressUrl,
  etherscanTxUrl,
  fromBase64Url,
  isSameAddress,
  isSepoliaChainId,
  looksLikeClaimLinkFragment,
  parsePacketText,
  SEPOLIA_CHAIN_ID,
  type ClaimPacket,
} from "@/lib/packet";
import { TxStatusLine } from "@/components/TxStatus";
import { describeDecryptError, formatConfidentialAmount } from "@/lib/confidential";
import { describeMutationError, type FriendlyError } from "@/lib/errors";
import { ErrorNote } from "@/components/ErrorNote";
import { SealStamp } from "@/components/SealStamp";

const CONFIDENTIAL_DECIMALS = 6;

type LoadState =
  | { kind: "idle" }
  | { kind: "error"; message: string; detail?: string }
  | { kind: "loaded"; packet: ClaimPacket };

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** Turn a raw error (SDK typed error or generic) into friendly, actionable copy. */
function describeClaimError(error: unknown): FriendlyError {
  if (isTokenOpsSdkError(error)) {
    switch (error.code) {
      case "TOKENOPS_ALREADY_CLAIMED":
        return { message: "This allocation has already been claimed — there's nothing left to do here." };
      case "TOKENOPS_CLAIM_NOT_STARTED":
        return { message: "The claim window hasn't opened yet — check back once it starts." };
      case "TOKENOPS_CLAIM_WINDOW_CLOSED":
        return { message: "The claim window has closed. Contact the campaign admin if you think this is a mistake." };
      case "TOKENOPS_PAUSED":
        return { message: "Claims are paused by the campaign admin right now — try again later." };
      case "TOKENOPS_INVALID_SIGNATURE":
        return { message: "This claim packet's signature doesn't check out — ask the sender for a fresh packet." };
      case "TOKENOPS_INSUFFICIENT_FEE":
        return { message: "Your wallet needs a little Sepolia ETH for gas — grab some from a faucet and retry." };
      case "TOKENOPS_WALLET_REJECTED":
      case "TOKENOPS_USER_REJECTED":
        return { message: "No problem — the transaction was cancelled." };
      case "TOKENOPS_WALLET_CHAIN_MISMATCH":
        return { message: "Your wallet is on the wrong network — switch to Sepolia and try again." };
      case "TOKENOPS_NETWORK_ERROR":
        return { message: "Couldn't reach the network — check your connection and try again." };
      case "TOKENOPS_CONTRACT_REVERT":
        return {
          message: "The transaction was rejected on-chain — this allocation may already be claimed, or the window may be closed.",
          detail: error.message,
        };
      default:
        return describeMutationError(error, "Something went wrong submitting the claim — you can try again.");
    }
  }
  return describeMutationError(error, "Something went wrong submitting the claim — you can try again.");
}

export interface ClaimPanelProps {
  /** Called once, right after a claim transaction succeeds, with the confidential token address. */
  onClaimed?: (token: string) => void;
  /** Called once a claim packet has been successfully loaded (file, drop, or paste). */
  onPacketLoaded?: () => void;
}

/**
 * Claim-packet intake + submission panel. Extracted from the standalone
 * /claim page so it can sit as the first section of the merged
 * "Claim & Verify" page, alongside {@link VerifyPanel}.
 */
export function ClaimPanel({ onClaimed, onPacketLoaded }: ClaimPanelProps) {
  const { address, isConnected, chainId } = useAccount();
  const { switchChain, isPending: isSwitching } = useSwitchChain();

  const [pasteText, setPasteText] = useState("");
  const [loadState, setLoadState] = useState<LoadState>({ kind: "idle" });
  const [isDragging, setIsDragging] = useState(false);

  const packet = loadState.kind === "loaded" ? loadState.packet : undefined;

  const claim = useClaim({ address: (packet?.airdrop ?? "0x0000000000000000000000000000000000000000") as `0x${string}` });

  const loadFromText = useCallback((raw: string) => {
    const result = parsePacketText(raw, address);
    if (!result.ok) {
      const message =
        result.error.kind === "empty-input"
          ? "Drop or paste a claim packet first."
          : result.error.kind === "invalid-json"
            ? "That file doesn't look like a claim packet — check it's the one your campaign admin sent you."
            : result.error.kind === "multiple-packets-need-wallet"
              ? `This file holds ${result.error.packetCount} claim packets. Connect your wallet and load it again — we'll pick out yours.`
              : result.error.kind === "no-packet-for-wallet"
                ? `This file holds ${result.error.packetCount} claim packets, but none belongs to the connected wallet. Switch to the wallet this claim was addressed to.`
                : "That doesn't look like a valid claim packet — check it against what your campaign admin sent you.";
      const detail = result.error.kind === "invalid-json" ? result.error.message : undefined;
      setLoadState({ kind: "error", message, detail });
      return;
    }
    setLoadState({ kind: "loaded", packet: result.packet });
    onPacketLoaded?.();
  }, [onPacketLoaded, address]);

  const onFileChange = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      const text = await file.text();
      loadFromText(text);
    },
    [loadFromText]
  );

  // Claim links (feature: shareable per-recipient URLs) embed the packet as
  // `#pkt=<base64url JSON>`. Handle it on mount and on hashchange (a visitor
  // could paste/replace the link without a full reload), then clear the hash
  // so the packet doesn't linger in the address bar/browser history.
  useEffect(() => {
    function handleHashPacket() {
      const hash = window.location.hash;
      if (!hash.startsWith("#pkt=")) return;
      const encoded = hash.slice("#pkt=".length);

      let decoded: string | undefined;
      try {
        decoded = fromBase64Url(encoded);
        JSON.parse(decoded); // throws on truncated/corrupt payloads even when decoding "succeeds"
      } catch {
        decoded = undefined;
      }

      if (decoded !== undefined) {
        loadFromText(decoded);
      } else if (looksLikeClaimLinkFragment(encoded)) {
        setLoadState({
          kind: "error",
          message:
            "This claim link looks incomplete — ask the sender to re-copy the full link, or use the packet file instead.",
        });
      }

      history.replaceState(null, "", window.location.pathname + window.location.search);
    }

    handleHashPacket();
    window.addEventListener("hashchange", handleHashPacket);
    return () => window.removeEventListener("hashchange", handleHashPacket);
  }, [loadFromText]);

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

  // Notify the parent (once) right after a claim succeeds, so it can scroll
  // to and pre-fill the verify section instead of linking away to another page.
  useEffect(() => {
    if (claim.isSuccess && packet) {
      onClaimed?.(packet.token);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claim.isSuccess, packet?.token]);

  return (
    <div>
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
          className="drop-zone flex cursor-pointer items-center justify-center gap-4 rounded-[var(--r-lg)] border-2 border-dashed px-6 py-6 text-center transition-all"
          style={{
            borderColor: isDragging ? "var(--gold)" : "var(--line-strong)",
            background: isDragging ? "var(--gold-dim)" : "var(--ink-2)",
          }}
        >
          <span className="drop-zone-icon inline-flex shrink-0">
            <EnvelopeIcon />
          </span>
          <span className="text-left">
            <span className="font-display block text-base">Drop your claim packet here</span>
            <span className="block text-xs" style={{ color: "var(--text-dim)" }}>
              .json file or claim link — or click to browse
            </span>
          </span>
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

        {loadState.kind === "error" && <ErrorNote message={loadState.message} detail={loadState.detail} />}
      </section>

      {packet && (
        <section className="envelope-card mt-10">
          <div className="envelope-flap" aria-hidden />
          <div className="relative z-10 p-6 pt-14">
            <h2 className="font-display text-lg">Claim summary</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt style={{ color: "var(--text-dim)" }}>Campaign contract</dt>
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
              <AllocationReveal
                packet={packet}
                canReveal={!recipientMismatch && !wrongChain && isConnected}
              />
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
              {/* useClaim resolves with the tx hash only on success — the
                  wallet-approval and confirming phases aren't separable. */}
              <TxStatusLine awaitingWallet={claim.isPending} className="mt-2 justify-center" />
            </div>

            {claim.isError && (
              <ErrorNote
                className="mt-4"
                message={describeClaimError(claim.error).message}
                detail={describeClaimError(claim.error).detail}
              />
            )}

            {claim.isSuccess && claim.data && (
              <div className="mt-4">
                <SealStamp>Claimed</SealStamp>
                <div className="callout callout-ok callout-col mt-3">
                  <span>
                    Claim submitted.{" "}
                    <a href={etherscanTxUrl(claim.data)} target="_blank" rel="noreferrer" className="font-data underline">
                      View on Etherscan
                    </a>
                  </span>
                  <a href="#verify" className="link-gold mt-2">
                    Verify &amp; decrypt my allocation ↓
                  </a>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      <p className="mt-10 text-xs" style={{ color: "var(--text-faint)" }}>
        Claim packets expected on chain ID {SEPOLIA_CHAIN_ID} (Sepolia). Never share your
        packet&apos;s signature with anyone other than the airdrop contract — it authorizes a
        one-time claim.
      </p>
    </div>
  );
}

/**
 * "Reveal my exact allocation" — uses the airdrop's dedicated
 * `getClaimAmount` mechanism instead of the claim flow. This is a WRITE
 * transaction (costs gas): it verifies the admin-signed allocation and
 * grants the caller decrypt access to the encrypted `euint64` amount handle
 * (an on-chain ACL grant via `FHE.allow`, extracted from the receipt — never
 * simulated). It does NOT consume the claim, so it works before or after the
 * recipient has submitted their claim.
 *
 * Mounted only once `packet` exists (a validated, non-optional prop) so the
 * `useGetClaimAmount`/`useDecryptValues` hooks never construct a client from
 * an undefined address — same crash-trap discipline as
 * `TokenIdentityCard`'s `BalanceReveal` and `VerifyPanel`'s
 * `ConfidentialBalanceSection`.
 */
function AllocationReveal({ packet, canReveal }: { packet: ClaimPacket; canReveal: boolean }) {
  const getClaimAmount = useGetClaimAmount({ address: packet.airdrop });
  const handle = getClaimAmount.data?.handle;

  // Auto-fires (EIP-712 signature prompt via the Zama relayer) as soon as the
  // handle lands from the getClaimAmount receipt. The handle was granted ACL
  // access on the airdrop contract (that's where `encryptUint64` bound the
  // ciphertext and where `FHE.allow` ran), so `contractAddress` is the
  // airdrop address, not the token address.
  const decrypt = useDecryptValues(handle ? [{ encryptedValue: handle, contractAddress: packet.airdrop }] : [], {
    enabled: !!handle,
    retry: false,
  });

  // Best-effort symbol lookup so the revealed amount can read "1,000 BLIND"
  // instead of a bare number — never blocks the reveal if it's slow/fails.
  const tokenMetadata = useMetadata(packet.token);
  const symbol = tokenMetadata.data?.symbol;

  const revealedRaw = handle ? decrypt.data?.[handle] : undefined;
  const revealed = typeof revealedRaw === "bigint" ? revealedRaw : undefined;

  const busy = getClaimAmount.isPending || (!!handle && decrypt.isFetching && revealed === undefined);

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <dt style={{ color: "var(--text-dim)" }}>Allocation</dt>
        <dd>
          {revealed !== undefined ? (
            <span className="unseal-enter font-data tabular text-sm" style={{ color: "var(--gold-bright)" }}>
              {formatConfidentialAmount(revealed, CONFIDENTIAL_DECIMALS)}
              {symbol ? ` ${symbol}` : ""}
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <span className="redaction px-2 py-0.5 text-sm">sealed</span>
              <button
                type="button"
                disabled={!canReveal || busy}
                onClick={() =>
                  getClaimAmount.mutate({
                    encryptedInput: packet.encryptedInput,
                    signature: packet.signature,
                  })
                }
                className="btn-quiet text-xs"
              >
                {busy ? "Revealing…" : "Reveal amount"}
              </button>
            </span>
          )}
        </dd>
      </div>

      {(getClaimAmount.isPending || (!!handle && decrypt.isLoading)) && (
        <div className="flex justify-end">
          {getClaimAmount.isPending ? (
            <TxStatusLine awaitingWallet className="justify-end" />
          ) : (
            <p className="font-data flex items-center gap-2 text-xs" style={{ color: "var(--text-dim)" }} role="status" aria-live="polite">
              Decrypting…
            </p>
          )}
        </div>
      )}

      {getClaimAmount.isError && (
        <ErrorNote
          message={describeClaimError(getClaimAmount.error).message}
          detail={describeClaimError(getClaimAmount.error).detail}
        />
      )}
      {handle && decrypt.isError && (
        <ErrorNote
          message={describeDecryptError(decrypt.error).message}
          detail={describeDecryptError(decrypt.error).detail}
        />
      )}

      <p className="text-xs" style={{ color: "var(--text-faint)" }}>
        Costs a small gas fee. Reveals what this packet grants you — only to you, and without
        claiming it.
      </p>
    </>
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
