/**
 * ABI + address for BlindDropRegistry, an opt-in, permissionless on-chain
 * index of confidential airdrop campaigns. Trimmed from the full contract
 * ABI (see /home/userdammy/BlindDrop/contracts/artifacts/contracts/BlindDropRegistry.sol/BlindDropRegistry.json)
 * to just the pieces the frontend uses: registering a campaign and reading
 * back the campaigns a given address has registered.
 *
 * IMPORTANT framing (from the contract's own NatSpec): this registry is an
 * index/cache the frontend uses to find campaigns after a reload — it is
 * never a source of authorization. Registering (or not registering) a
 * campaign here has no bearing on who can claim, fund, or administer it.
 */

export const BLINDDROP_REGISTRY_ADDRESS = "0xA95082Fa6Cf0c8c7052dEB5b24F00C545740457F" as const;

export const blindDropRegistryAbi = [
  {
    inputs: [
      { internalType: "address", name: "campaign", type: "address" },
      { internalType: "address", name: "token", type: "address" },
    ],
    name: "registerCampaign",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "registrar", type: "address" }],
    name: "campaignsOf",
    outputs: [{ internalType: "address[]", name: "", type: "address[]" }],
    stateMutability: "view",
    type: "function",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "campaign", type: "address" },
      { indexed: true, internalType: "address", name: "token", type: "address" },
      { indexed: true, internalType: "address", name: "registrar", type: "address" },
      { indexed: false, internalType: "uint256", name: "timestamp", type: "uint256" },
    ],
    name: "CampaignRegistered",
    type: "event",
  },
  { inputs: [], name: "CampaignAlreadyRegistered", type: "error" },
  { inputs: [], name: "NotCampaignAdmin", type: "error" },
  { inputs: [], name: "ZeroAddress", type: "error" },
] as const;
