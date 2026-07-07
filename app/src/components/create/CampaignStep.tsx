"use client";

import { useMemo, useState } from "react";
import { useAccount, useChainId, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { sepolia } from "wagmi/chains";
import { BLINDDROP_REGISTRY_ADDRESS, blindDropRegistryAbi } from "@/lib/registry";
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
import { loadCampaignNames, saveCampaignName } from "@/lib/create-storage";
import { TokenIdentityCard } from "@/components/TokenIdentityCard";
import { TxHashLink, TxStatusLine } from "@/components/TxStatus";
import { InfoTip } from "@/components/InfoTip";
import { TokenSelect } from "@/components/TokenSelect";
import { TokenAmountSummary } from "@/components/TokenAmountSummary";
import { SealStamp } from "@/components/SealStamp";
import type { RecipientRow } from "@/lib/csv";
import { scaleAmountToUnits } from "@/lib/csv";
import { toTokenOpsEncryptor } from "@/lib/encryptor";
import { describeMutationError, type FriendlyError } from "@/lib/errors";
import { ErrorNote } from "@/components/ErrorNote";

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
  // Default the claim window to open immediately (a minute in the past guards
  // against minor clock skew) — claims can't succeed until the campaign is
  // funded anyway, so a future start only adds a confusing "not started" wait.
  const [startTimestamp, setStartTimestamp] = useState<number>(now - 60);
  const [endTimestamp, setEndTimestamp] = useState<number>(now + 30 * 86400);
  const [deployError, setDeployError] = useState<FriendlyError | null>(null);

  const create = useCreateConfidentialAirdropAndGetAddress();
  const { data: defaultGasFee } = useFactoryDefaultGasFee();
  const { data: customFee } = useFactoryCustomFee(address ? { creator: address } : undefined);

  const totalAmountUnits = useMemo(
    () => recipients.reduce((sum, r) => sum + scaleAmountToUnits(r.amount, 6), BigInt(0)),
    [recipients]
  );

  const wrongChain = isConnected && chainId !== sepolia.id;
  const tokenValid = /^0x[0-9a-fA-F]{40}$/.test(tokenAddress);

  // Claim-window validation: checked independently so the error message can
  // point at exactly what's wrong, rather than a single generic message that
  // doesn't distinguish "end before start" from "window already elapsed".
  const windowEndsBeforeStart = endTimestamp <= startTimestamp;
  const windowAlreadyOver = !windowEndsBeforeStart && endTimestamp <= now;
  const windowValid = !windowEndsBeforeStart && !windowAlreadyOver;
  // Soft warning only — a start time slightly in the past is fine (e.g. clock
  // skew or a deliberate immediate-start campaign), so this never blocks Deploy.
  const startInPast = startTimestamp < now - 5 * 60;

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
      setDeployError(describeMutationError(err, "Couldn't deploy the campaign — you can try again."));
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
        <p>Wrong network. BlindDrop campaigns deploy on Sepolia.</p>
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
          <span className="label">Confidential token (ERC-7984)</span>
          <div className="mt-1">
            <TokenSelect value={tokenAddress} onChange={setTokenAddress} disabled={!!deployed} />
          </div>
          {!tokenAddress && (
            <span className="mt-1 block text-xs" style={{ color: "var(--text-faint)" }}>
              Defaults to the CTTT testnet token if available.
            </span>
          )}
          {/* Once deployed, the token is locked on-chain — shown only as the
              compact line in the "Airdrop deployed" confirmation below, so it
              isn't rendered twice. */}
          {tokenValid && !deployed && (
            <div className="mt-3">
              <TokenIdentityCard
                address={tokenAddress as Address}
                compareUnits={totalAmountUnits}
                compareLabel="campaign total"
              />
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
        {windowEndsBeforeStart && (
          <p className="text-xs" style={{ color: "var(--err)" }}>
            Claim window ends before it starts.
          </p>
        )}
        {windowAlreadyOver && (
          <p className="text-xs" style={{ color: "var(--err)" }}>
            Claim window is already over.
          </p>
        )}
        {windowValid && startInPast && (
          <p className="text-xs" style={{ color: "var(--warn)" }}>
            Claim window start is in the past — the campaign will be immediately claimable.
          </p>
        )}
        <p className="text-xs" style={{ color: "var(--text-faint)" }}>
          The claim window can&apos;t be extended once the campaign is deployed.
        </p>
      </div>

      {!deployed ? (
        <div>
          {tokenValid && recipients.length > 0 && (
            <TokenAmountSummary
              token={tokenAddress as Address}
              amountUnits={totalAmountUnits}
              recipientCount={recipients.length}
              className="mb-3 text-sm"
            />
          )}
          <p className="mb-3 text-xs" style={{ color: "var(--text-faint)" }}>
            Deploying takes two wallet transactions (deploy + fund). Sealing packets costs no
            gas — only signatures.
          </p>
          <button
            type="button"
            onClick={handleDeploy}
            disabled={!tokenValid || !windowValid || create.isPending}
            className="btn btn-seal"
          >
            {create.isPending ? "Deploying…" : "Deploy campaign"}
          </button>
          {/* The create hook resolves only after the receipt is parsed, so the
              wallet-approval and confirming phases can't be told apart. */}
          <TxStatusLine awaitingWallet={create.isPending} className="mt-2" />
          {deployError && <ErrorNote className="mt-2" message={deployError.message} detail={deployError.detail} />}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="callout callout-gold callout-col">
            <SealStamp className="mb-1">Campaign deployed</SealStamp>
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

          <NameCampaignPanel airdropAddress={deployed.airdrop} />

          <SaveToRegistry deployed={deployed} />

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

const CAMPAIGN_NAME_MAX_LENGTH = 40;

/**
 * Optional nickname prompt shown right after deploy — the natural moment to
 * name a campaign, before an admin has to hunt for it in "Your campaigns"
 * later. Saved only to this browser's localStorage (`create-storage.ts`);
 * never sent anywhere or included in any on-chain call.
 */
function NameCampaignPanel({ airdropAddress }: { airdropAddress: Address }) {
  const [name, setName] = useState(() => loadCampaignNames()[airdropAddress.toLowerCase()] ?? "");
  const [saved, setSaved] = useState(false);

  function handleSave() {
    saveCampaignName(airdropAddress, name);
    setName(name.trim().slice(0, CAMPAIGN_NAME_MAX_LENGTH));
    setSaved(true);
  }

  return (
    <div className="panel p-4">
      <h3 className="eyebrow">Name this campaign</h3>
      <p className="mt-2 text-sm" style={{ color: "var(--text-dim)" }}>
        Optional — a label to help you tell campaigns apart later, e.g. &quot;Investor Round&quot;.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={name}
          maxLength={CAMPAIGN_NAME_MAX_LENGTH}
          placeholder="e.g. Investor Round"
          onChange={(e) => {
            setName(e.target.value);
            setSaved(false);
          }}
          className="field text-sm"
        />
        <button type="button" onClick={handleSave} className="btn btn-gold text-xs">
          {saved ? "Saved ✓" : "Save name"}
        </button>
      </div>
      <p className="mt-2 text-xs" style={{ color: "var(--text-faint)" }}>
        Names are saved only in this browser — never on-chain.
      </p>
    </div>
  );
}

/**
 * Opt-in "Save to my campaigns" action — registers the deployed campaign in
 * BlindDropRegistry so it can be found again after a page reload. Costs one
 * small gas-only transaction; never required to use the campaign. The
 * registry is purely an index/cache, never a source of claim/fund
 * authorization, so declining to save (or the tx failing) has no effect on
 * the campaign itself.
 */
function SaveToRegistry({ deployed }: { deployed: DeployedCampaign }) {
  // wagmi's useWriteContract resolves with the tx hash at SUBMISSION time (it
  // doesn't wait for the receipt), so this is the one action where the full
  // phase split is honestly observable: pending-no-hash = wallet approval,
  // hash + receipt pending = confirming on Sepolia.
  const { writeContract, data: hash, isPending, isError, error } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });
  const registered = receipt.isSuccess;

  function handleSave() {
    writeContract({
      address: BLINDDROP_REGISTRY_ADDRESS,
      abi: blindDropRegistryAbi,
      functionName: "registerCampaign",
      args: [deployed.airdrop, deployed.token],
    });
  }

  return (
    <div className="panel p-4">
      <h3 className="eyebrow">Save for later</h3>
      <p className="mt-2 text-sm" style={{ color: "var(--text-dim)" }}>
        Register this campaign in the on-chain index so you can find it again after a reload — a
        small gas fee, purely a lookup aid, never affects who can claim or fund it.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending || (!!hash && !receipt.isError) }
          className="btn btn-gold text-xs"
        >
          {registered ? "Registered ✓" : isPending || receipt.isLoading ? "Saving…" : "Save to my campaigns"}
        </button>
        <TxStatusLine
          awaitingWallet={isPending}
          confirming={receipt.isLoading}
          hash={hash}
          combined={false}
        />
        {registered && hash && <TxHashLink hash={hash} />}
        {isError && (
          <span className="text-xs" style={{ color: "var(--err)" }}>
            {describeMutationError(error, "Couldn't save this campaign — you can try again.").message}
          </span>
        )}
        {receipt.isError && (
          <span className="text-xs" style={{ color: "var(--err)" }}>
            The registration transaction failed on-chain. You can try again.
          </span>
        )}
      </div>
    </div>
  );
}

/** Map a fund-mutation error to a plain-language message an admin can act on. */
function describeFundError(error: unknown): FriendlyError & { needsApproval: boolean } {
  const raw = error instanceof Error ? error.message : String(error);
  if (raw.includes("79f2cb38") || raw.includes("UnauthorizedSpender")) {
    return {
      message: "The factory isn't approved to move your tokens yet — complete the approval step above.",
      needsApproval: true,
    };
  }
  const { message, detail } = describeMutationError(error, "Couldn't fund the campaign — you can try again.");
  return { message, detail, needsApproval: false };
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
        Funding moves the encrypted total from your wallet into the campaign so recipients can claim. First
        allow the campaign factory to move your tokens (a one-time approval), then fund.
      </p>
      <TokenAmountSummary
        token={deployed.token}
        amountUnits={totalAmountUnits}
        recipientCount={recipients.length}
        className="mt-2 text-sm"
        showRawUnits
      />

      <div className="mt-4 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span className="seal-badge shrink-0" data-state={approved ? "done" : "active"} style={{ width: "1.5rem", height: "1.5rem" }}>
            {approved ? "✓" : "1"}
          </span>
          <div className="flex-1">
            <p className="text-sm" style={{ color: "var(--text)" }}>
              Allow the campaign factory to move your tokens as an operator
              <InfoTip
                label="Operator"
                note="An address your token explicitly allows to move funds on your behalf — revocable, time-limited."
              />
            </p>
            {isOperator.isLoading && (
              <p className="text-xs" style={{ color: "var(--text-faint)" }}>
                Checking approval status…
              </p>
            )}
            {!isOperator.isLoading && approved && (
              <p className="text-xs" style={{ color: "var(--ok)" }}>
                Factory approved to move your tokens.{" "}
                {setOperator.data?.txHash && <TxHashLink hash={setOperator.data.txHash} />}
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
        {/* The Zama setOperator mutation only resolves once the tx is mined,
            so wallet-approval vs confirming can't be told apart mid-flight. */}
        <TxStatusLine awaitingWallet={setOperator.isPending} className="ml-9" />
        {setOperator.isError && (
          <ErrorNote
            message={describeMutationError(setOperator.error, "Couldn't complete the approval — you can try again.").message}
            detail={describeMutationError(setOperator.error, "Couldn't complete the approval — you can try again.").detail}
          />
        )}

        <div className="flex items-center gap-3">
          <span
            className="seal-badge shrink-0"
            data-state={fund.isSuccess ? "done" : approved ? "active" : undefined}
            style={{ width: "1.5rem", height: "1.5rem" }}
          >
            {fund.isSuccess ? "✓" : "2"}
          </span>
          <div className="flex-1">
            <p className="text-sm" style={{ color: "var(--text)" }}>
              {fund.isSuccess ? "Campaign funded" : "Fund the campaign"}
            </p>
          </div>
          {!fund.isSuccess && (
            <button
              type="button"
              onClick={handleFund}
              disabled={!approved || fund.isPending || totalAmountUnits === BigInt(0)}
              className="btn btn-gold shrink-0 text-xs"
            >
              {fund.isPending ? "Funding…" : "Fund campaign"}
            </button>
          )}
        </div>
        {/* The fund mutation resolves with the tx hash only on success — no
            intermediate hash is observable, hence the combined message. */}
        <TxStatusLine awaitingWallet={fund.isPending} className="ml-9" />
      </div>

      {fund.isSuccess && fund.data && (
        <p className="mt-3 text-sm" style={{ color: "var(--ok)" }}>
          Funding transaction submitted. <TxHashLink hash={fund.data} />
        </p>
      )}
      {fundError && (
        <ErrorNote
          className="mt-3"
          message={
            fundError.needsApproval
              ? fundError.message
              : `${fundError.message} You can also fund manually by sending confidential tokens directly to ${deployed.airdrop}.`
          }
          detail={fundError.detail}
        />
      )}
    </div>
  );
}
