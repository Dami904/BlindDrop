"use client";

import { useMemo, useState } from "react";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { sepolia } from "wagmi/chains";
import { useZamaSDK, useConfidentialIsOperator, useConfidentialSetOperator } from "@zama-fhe/react-sdk";
import type { ZamaSDK } from "@zama-fhe/sdk";
import {
  useCreateConfidentialAirdropAndGetAddress,
  useFactoryCustomFee,
  useFactoryDefaultGasFee,
  useFundConfidentialAirdrop,
} from "@tokenops/sdk/fhe-airdrop/react";
import { getConfidentialTestTokenAddress, getFheAirdropFactoryAddress } from "@tokenops/sdk";
import type { Address, Hex } from "viem";
import { etherscanAddressUrl, etherscanTxUrl } from "@/lib/packet";
import { TokenIdentityCard } from "@/components/TokenIdentityCard";
import type { RecipientRow } from "@/lib/csv";
import { scaleAmountToUnits } from "@/lib/csv";
import { toTokenOpsEncryptor } from "@/lib/encryptor";

export interface DeployedCampaign {
  airdrop: Address;
  hash: Hex;
  token: Address;
  userSalt: Hex;
  gasFee: bigint;
  admin: Address;
  startTimestamp: number;
  endTimestamp: number;
}

interface CampaignStepProps {
  recipients: RecipientRow[];
  userSalt: Hex;
  deployed: DeployedCampaign | null;
  onDeployed: (campaign: DeployedCampaign) => void;
  onNext: () => void;
}

function toDatetimeLocal(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocal(value: string): number {
  return Math.floor(new Date(value).getTime() / 1000);
}

export function CampaignStep({ recipients, userSalt, deployed, onDeployed, onNext }: CampaignStepProps) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending: switching } = useSwitchChain();
  const zamaSDK = useZamaSDK();

  const now = Math.floor(Date.now() / 1000);
  const defaultToken = getConfidentialTestTokenAddress(sepolia.id) ?? "";

  const [tokenAddress, setTokenAddress] = useState<string>(defaultToken);
  const [startTimestamp, setStartTimestamp] = useState<number>(now + 5 * 60);
  const [endTimestamp, setEndTimestamp] = useState<number>(now + 30 * 86400);
  const [deployError, setDeployError] = useState<string | null>(null);

  const create = useCreateConfidentialAirdropAndGetAddress();
  const { data: defaultGasFee } = useFactoryDefaultGasFee();
  const { data: customFee } = useFactoryCustomFee(address ? { creator: address } : undefined);

  const totalAmountUnits = useMemo(
    () => recipients.reduce((sum, r) => sum + scaleAmountToUnits(r.amount, 6), BigInt(0)),
    [recipients]
  );

  const wrongChain = isConnected && chainId !== sepolia.id;
  const tokenValid = /^0x[0-9a-fA-F]{40}$/.test(tokenAddress);
  const windowValid = startTimestamp > now - 60 && endTimestamp > startTimestamp;

  async function handleDeploy() {
    setDeployError(null);
    if (!address) return;
    try {
      const effectiveGasFee = customFee?.enabled ? customFee.gasFee : defaultGasFee ?? BigInt(0);
      const { hash, airdrop } = await create.mutateAsync({
        params: {
          token: tokenAddress as Address,
          startTimestamp,
          endTimestamp,
          canExtendClaimWindow: false,
          admin: address,
        },
        userSalt,
      });
      onDeployed({
        airdrop,
        hash,
        token: tokenAddress as Address,
        userSalt,
        gasFee: effectiveGasFee,
        admin: address,
        startTimestamp,
        endTimestamp,
      });
    } catch (err) {
      setDeployError(err instanceof Error ? err.message : String(err));
    }
  }

  if (!isConnected) {
    return (
      <div className="panel p-6 text-center" style={{ color: "var(--text-dim)" }}>
        Connect your wallet to configure and deploy a campaign.
      </div>
    );
  }

  if (wrongChain) {
    return (
      <div className="callout callout-warn callout-col callout-center">
        <p>Wrong network. BlindDrop airdrops deploy on Sepolia.</p>
        <button
          type="button"
          onClick={() => switchChain({ chainId: sepolia.id })}
          disabled={switching}
          className="btn btn-gold mt-3"
        >
          {switching ? "Switching…" : "Switch to Sepolia"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <div className="flex items-center gap-3">
          <span className="seal-badge" data-state="active">
            2
          </span>
          <h2 className="font-display text-lg">Campaign</h2>
        </div>
        <p className="mt-2 ml-10 text-sm" style={{ color: "var(--text-dim)" }}>
          Configure the token and claim window, then deploy the airdrop clone.
        </p>
      </div>

      <div className="grid gap-4">
        <label className="block">
          <span className="label">Confidential token address (ERC-7984)</span>
          <input
            value={tokenAddress}
            onChange={(e) => setTokenAddress(e.target.value)}
            disabled={!!deployed}
            placeholder="0x..."
            className="field font-data mt-1 disabled:opacity-60"
          />
          {!tokenAddress && (
            <span className="mt-1 block text-xs" style={{ color: "var(--text-faint)" }}>
              Defaults to the CTTT testnet token if available.
            </span>
          )}
          {tokenValid && (
            <div className="mt-3">
              <TokenIdentityCard address={tokenAddress as Address} />
            </div>
          )}
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="label">Claim window start</span>
            <input
              type="datetime-local"
              value={toDatetimeLocal(startTimestamp)}
              onChange={(e) => setStartTimestamp(fromDatetimeLocal(e.target.value))}
              disabled={!!deployed}
              className="field mt-1 disabled:opacity-60"
            />
          </label>
          <label className="block">
            <span className="label">Claim window end</span>
            <input
              type="datetime-local"
              value={toDatetimeLocal(endTimestamp)}
              onChange={(e) => setEndTimestamp(fromDatetimeLocal(e.target.value))}
              disabled={!!deployed}
              className="field mt-1 disabled:opacity-60"
            />
          </label>
        </div>
        {!windowValid && <p className="text-xs" style={{ color: "var(--err)" }}>Claim window end must be after start.</p>}
        <p className="text-xs" style={{ color: "var(--text-faint)" }}>
          The claim window can&apos;t be extended once the campaign is deployed.
        </p>
      </div>

      {!deployed ? (
        <div>
          <button
            type="button"
            onClick={handleDeploy}
            disabled={!tokenValid || !windowValid || create.isPending}
            className="btn btn-seal"
          >
            {create.isPending ? "Deploying…" : "Deploy campaign"}
          </button>
          {deployError && <p className="mt-2 text-sm" style={{ color: "var(--err)" }}>{deployError}</p>}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="callout callout-gold callout-col">
            <p>Airdrop deployed.</p>
            <a
              href={etherscanAddressUrl(deployed.airdrop)}
              target="_blank"
              rel="noreferrer"
              className="link-gold font-data mt-1 block break-all text-sm"
            >
              {deployed.airdrop}
            </a>
            <a
              href={etherscanTxUrl(deployed.hash)}
              target="_blank"
              rel="noreferrer"
              className="mt-1 block text-xs underline"
              style={{ color: "var(--text-dim)" }}
            >
              View deployment tx
            </a>
            <TokenIdentityCard address={deployed.token} compact className="mt-2" />
          </div>

          {address && (
            <FundingPanel
              deployed={deployed}
              recipients={recipients}
              totalAmountUnits={totalAmountUnits}
              zamaSDK={zamaSDK}
              connectedAddress={address}
            />
          )}

          <div>
            <button type="button" onClick={onNext} className="btn btn-seal">
              Continue to claim packets →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Map a fund-mutation error to a plain-language message an admin can act on. */
function describeFundError(error: unknown): { message: string; needsApproval: boolean } {
  const raw = error instanceof Error ? error.message : String(error);
  if (raw.includes("79f2cb38") || raw.includes("UnauthorizedSpender")) {
    return {
      message: "The factory isn't approved to move your tokens yet — complete the approval step first.",
      needsApproval: true,
    };
  }
  return { message: raw, needsApproval: false };
}

/**
 * Two-step funding flow: approve the campaign factory as an ERC-7984 operator
 * on the token, then fund the deployed airdrop clone. Only mounted once a
 * campaign is deployed, so `deployed.token` is always a valid address —
 * `useConfidentialSetOperator` and `useConfidentialIsOperator` build a token
 * client from their address arguments even while conceptually "disabled", so
 * they must never be reached with an unvalidated address.
 */
function FundingPanel({
  deployed,
  recipients,
  totalAmountUnits,
  zamaSDK,
  connectedAddress,
}: {
  deployed: DeployedCampaign;
  recipients: RecipientRow[];
  totalAmountUnits: bigint;
  zamaSDK: ZamaSDK;
  connectedAddress: Address;
}) {
  const factoryAddress = getFheAirdropFactoryAddress(sepolia.id);

  const isOperator = useConfidentialIsOperator({
    address: deployed.token,
    spender: factoryAddress,
    holder: connectedAddress,
  });
  const setOperator = useConfidentialSetOperator(deployed.token);
  const fund = useFundConfidentialAirdrop({ encryptor: () => toTokenOpsEncryptor(zamaSDK.relayer) });

  const approved = isOperator.data === true;
  const fundError = fund.isError ? describeFundError(fund.error) : null;

  async function handleApprove() {
    if (!factoryAddress) return;
    try {
      await setOperator.mutateAsync({ operator: factoryAddress, until: Math.floor(Date.now() / 1000) + 3600 });
      isOperator.refetch();
    } catch {
      // surfaced via setOperator.error below
    }
  }

  async function handleFund() {
    try {
      await fund.mutateAsync({
        token: deployed.token,
        params: {
          token: deployed.token,
          startTimestamp: deployed.startTimestamp,
          endTimestamp: deployed.endTimestamp,
          canExtendClaimWindow: false,
          admin: deployed.admin,
        },
        userSalt: deployed.userSalt,
        deployer: deployed.admin,
        gasFee: deployed.gasFee,
        amount: totalAmountUnits,
      });
    } catch {
      // surfaced via fund.error below
    }
  }

  return (
    <div className="panel p-4">
      <h3 className="eyebrow">Fund the campaign</h3>
      <p className="mt-2 text-sm" style={{ color: "var(--text-dim)" }}>
        Funding moves the encrypted total ({recipients.length} recipient{recipients.length === 1 ? "" : "s"},{" "}
        <span className="font-data tabular">{totalAmountUnits.toString()}</span> raw units) from your wallet into
        the campaign so recipients can claim. First allow the campaign factory to move your tokens (a one-time
        approval), then fund.
      </p>

      <div className="mt-4 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span className="seal-badge shrink-0" data-state={approved ? "done" : "active"} style={{ width: "1.5rem", height: "1.5rem" }}>
            {approved ? "✓" : "1"}
          </span>
          <div className="flex-1">
            <p className="text-sm" style={{ color: "var(--text)" }}>
              Allow the campaign factory to move your tokens
            </p>
            {isOperator.isLoading && (
              <p className="text-xs" style={{ color: "var(--text-faint)" }}>
                Checking approval status…
              </p>
            )}
            {!isOperator.isLoading && approved && (
              <p className="text-xs" style={{ color: "var(--ok)" }}>
                Factory approved to move your tokens.
              </p>
            )}
          </div>
          {!isOperator.isLoading && !approved && (
            <button
              type="button"
              onClick={handleApprove}
              disabled={setOperator.isPending || !factoryAddress}
              className="btn btn-gold shrink-0 text-xs"
            >
              {setOperator.isPending ? "Approving…" : "Approve"}
            </button>
          )}
        </div>
        {setOperator.isError && (
          <p className="text-xs" style={{ color: "var(--err)" }}>
            {setOperator.error instanceof Error ? setOperator.error.message : String(setOperator.error)}
          </p>
        )}

        <div className="flex items-center gap-3">
          <span className="seal-badge shrink-0" data-state={approved ? "active" : undefined} style={{ width: "1.5rem", height: "1.5rem" }}>
            2
          </span>
          <div className="flex-1">
            <p className="text-sm" style={{ color: "var(--text)" }}>
              Fund the campaign
            </p>
          </div>
          <button
            type="button"
            onClick={handleFund}
            disabled={!approved || fund.isPending || totalAmountUnits === BigInt(0)}
            className="btn btn-gold shrink-0 text-xs"
          >
            {fund.isPending ? "Funding…" : "Fund campaign"}
          </button>
        </div>
      </div>

      {fund.isSuccess && (
        <p className="mt-3 text-sm" style={{ color: "var(--ok)" }}>
          Funding transaction submitted.
        </p>
      )}
      {fundError && (
        <p className="mt-3 text-sm" style={{ color: "var(--err)" }}>
          {fundError.message}
          {!fundError.needsApproval && (
            <>
              {" "}
              You can instead fund manually by transferring/wrapping confidential tokens directly to{" "}
              <span className="font-data">{deployed.airdrop}</span>.
            </>
          )}
        </p>
      )}
    </div>
  );
}
