"use client";

import { useMemo, useState } from "react";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { sepolia } from "wagmi/chains";
import { useZamaSDK } from "@zama-fhe/react-sdk";
import {
  useCreateConfidentialAirdropAndGetAddress,
  useFactoryCustomFee,
  useFactoryDefaultGasFee,
  useFundConfidentialAirdrop,
} from "@tokenops/sdk/fhe-airdrop/react";
import { getConfidentialTestTokenAddress } from "@tokenops/sdk";
import type { Address, Hex } from "viem";
import { etherscanAddressUrl, etherscanTxUrl } from "@/lib/packet";
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
  const fund = useFundConfidentialAirdrop({ encryptor: () => toTokenOpsEncryptor(zamaSDK.relayer) });

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

  async function handleFund() {
    if (!deployed) return;
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
          Extendable claim window: disabled (fixed for this flow).
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
          </div>

          <div className="panel p-4">
            <h3 className="eyebrow">Fund the campaign</h3>
            <p className="mt-2 text-sm" style={{ color: "var(--text-dim)" }}>
              Before recipients can claim, the airdrop contract needs an encrypted token balance
              covering the total allocation ({recipients.length} recipient{recipients.length === 1 ? "" : "s"},
              raw units: <span className="font-data tabular">{totalAmountUnits.toString()}</span>). This requires
              the factory to be an approved operator on your token (
              <code className="font-data" style={{ color: "var(--text)" }}>
                token.setOperator(factory, deadline)
              </code>
              ).
            </p>
            <button
              type="button"
              onClick={handleFund}
              disabled={fund.isPending || totalAmountUnits === BigInt(0)}
              className="btn btn-gold mt-3"
            >
              {fund.isPending ? "Funding…" : "Fund campaign via factory"}
            </button>
            {fund.isSuccess && (
              <p className="mt-2 text-sm" style={{ color: "var(--ok)" }}>
                Funding transaction submitted.
              </p>
            )}
            {fund.isError && (
              <p className="mt-2 text-sm" style={{ color: "var(--err)" }}>
                {fund.error instanceof Error ? fund.error.message : String(fund.error)} — you can instead fund
                manually by transferring/wrapping confidential tokens directly to{" "}
                <span className="font-data">{deployed.airdrop}</span>.
              </p>
            )}
          </div>

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
