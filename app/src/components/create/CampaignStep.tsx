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
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6 text-center text-zinc-400">
        Connect your wallet to configure and deploy a campaign.
      </div>
    );
  }

  if (wrongChain) {
    return (
      <div className="rounded-lg border border-amber-800/50 bg-amber-950/30 p-6 text-center text-amber-300">
        <p>Wrong network. BlindDrop airdrops deploy on Sepolia.</p>
        <button
          type="button"
          onClick={() => switchChain({ chainId: sepolia.id })}
          disabled={switching}
          className="mt-3 rounded-full bg-amber-500 px-4 py-2 text-sm font-medium text-black hover:bg-amber-400 disabled:opacity-50"
        >
          {switching ? "Switching…" : "Switch to Sepolia"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-medium text-zinc-100">2. Campaign</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Configure the token and claim window, then deploy the airdrop clone.
        </p>
      </div>

      <div className="grid gap-4">
        <label className="block">
          <span className="text-sm font-medium text-zinc-200">Confidential token address (ERC-7984)</span>
          <input
            value={tokenAddress}
            onChange={(e) => setTokenAddress(e.target.value)}
            disabled={!!deployed}
            placeholder="0x..."
            className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none disabled:opacity-60"
          />
          {!tokenAddress && (
            <span className="mt-1 block text-xs text-zinc-500">Defaults to the CTTT testnet token if available.</span>
          )}
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-zinc-200">Claim window start</span>
            <input
              type="datetime-local"
              value={toDatetimeLocal(startTimestamp)}
              onChange={(e) => setStartTimestamp(fromDatetimeLocal(e.target.value))}
              disabled={!!deployed}
              className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none disabled:opacity-60"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-zinc-200">Claim window end</span>
            <input
              type="datetime-local"
              value={toDatetimeLocal(endTimestamp)}
              onChange={(e) => setEndTimestamp(fromDatetimeLocal(e.target.value))}
              disabled={!!deployed}
              className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none disabled:opacity-60"
            />
          </label>
        </div>
        {!windowValid && (
          <p className="text-xs text-red-400">Claim window end must be after start.</p>
        )}
        <p className="text-xs text-zinc-500">Extendable claim window: disabled (fixed for this flow).</p>
      </div>

      {!deployed ? (
        <div>
          <button
            type="button"
            onClick={handleDeploy}
            disabled={!tokenValid || !windowValid || create.isPending}
            className="rounded-full bg-emerald-500 px-5 py-2 text-sm font-medium text-black hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {create.isPending ? "Deploying…" : "Deploy campaign"}
          </button>
          {deployError && <p className="mt-2 text-sm text-red-400">{deployError}</p>}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-emerald-800/50 bg-emerald-950/30 p-4">
            <p className="text-sm text-emerald-300">Airdrop deployed.</p>
            <a
              href={etherscanAddressUrl(deployed.airdrop)}
              target="_blank"
              rel="noreferrer"
              className="mt-1 block break-all font-mono text-sm text-emerald-200 underline"
            >
              {deployed.airdrop}
            </a>
            <a
              href={etherscanTxUrl(deployed.hash)}
              target="_blank"
              rel="noreferrer"
              className="mt-1 block text-xs text-zinc-400 underline"
            >
              View deployment tx
            </a>
          </div>

          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
            <h3 className="text-sm font-medium text-zinc-200">Fund the campaign</h3>
            <p className="mt-1 text-sm text-zinc-400">
              Before recipients can claim, the airdrop contract needs an encrypted token balance covering the
              total allocation ({recipients.length} recipient{recipients.length === 1 ? "" : "s"}, raw units:{" "}
              {totalAmountUnits.toString()}). This requires the factory to be an approved operator on your
              token (<code className="text-zinc-300">token.setOperator(factory, deadline)</code>).
            </p>
            <button
              type="button"
              onClick={handleFund}
              disabled={fund.isPending || totalAmountUnits === BigInt(0)}
              className="mt-3 rounded-full bg-zinc-100 px-4 py-2 text-sm font-medium text-black hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {fund.isPending ? "Funding…" : "Fund campaign via factory"}
            </button>
            {fund.isSuccess && <p className="mt-2 text-sm text-emerald-400">Funding transaction submitted.</p>}
            {fund.isError && (
              <p className="mt-2 text-sm text-red-400">
                {fund.error instanceof Error ? fund.error.message : String(fund.error)} — you can instead fund
                manually by transferring/wrapping confidential tokens directly to{" "}
                <span className="font-mono">{deployed.airdrop}</span>.
              </p>
            )}
          </div>

          <div>
            <button
              type="button"
              onClick={onNext}
              className="rounded-full bg-emerald-500 px-5 py-2 text-sm font-medium text-black hover:bg-emerald-400"
            >
              Continue to claim packets
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
