# Bounty Compliance — Zama Developer Program S3, Special Bounty × TokenOps

Requirement-by-requirement mapping from the bounty text to this project.
Source: [Season 3 announcement](https://www.zama.org/post/zama-developer-program-mainnet-season-3-composable-privacy-is-the-key).

| # | Bounty requirement (verbatim/paraphrased) | How BlindDrop satisfies it | Status |
|---|---|---|---|
| 1 | "Create the best confidential application **using the TokenOps SDK** on the Zama Protocol" | Built directly on `@tokenops/sdk@1.1.1`: `fhe-airdrop` factory client + React hooks (campaign creation, claim authorizations, claims), `fhe-disperse` singleton client, `testnet-faucet` client. No forked or bypassed SDK code paths. | In progress |
| 2 | "dApp powering a **confidential airdrop or confidential disperse flow**" | Both flows in one app: `/create` (airdrop campaign: CSV → encrypt → deploy clone → claim packets) and `/disperse` (one-shot confidential batch send). | In progress |
| 3 | "**Polished frontend** that makes confidential distribution feel effortless" (primary judging criterion) | Dedicated design pass; CSV batch upload; per-recipient claim packets (download/link) so the admin never manually handles ciphertexts; loading/empty/error states throughout; `/faucet` page so judges can self-serve TTT/CTTT test tokens and try the full flow in minutes. | Planned |
| 4 | "Recipients should be able to **verify and decrypt their own allocation**" | `/verify` screen: EIP-712 user-decryption via `@zama-fhe/react-sdk` — recipient decrypts their own claimed amount client-side; no one else (including the admin, post-distribution) can. | Planned |
| 5 | "**Distribution amounts** … remain confidential onchain" | Amounts are FHE-encrypted end-to-end: encrypted client-side (input proof bound to the recipient per Zama binding rules), stored/transferred as `euint64` via ERC-7984; never appear in plaintext on-chain. | In progress |
| 6 | "**Recipient lists** remain confidential onchain" | The recipient list never touches the chain: claim authorizations are signed off-chain by the admin and delivered privately per-recipient (claim packets). On-chain state only ever reflects addresses that individually choose to claim. Residual leaks (claim-tx sender, ERC-7984 event addresses) documented in THREAT_MODEL.md — inherent to the audited TokenOps design, stated without overclaiming. | In progress |
| 7 | Deployment target: Zama Protocol (Sepolia testnet supported for S3) | Sepolia via TokenOps' pre-deployed audited contracts (`fhe-airdrop` factory, `fhe-disperse` singleton) — the same contracts audited by [OpenZeppelin](https://www.openzeppelin.com/news/tokenops-zama-confidential-airdrop-audit) (Dec 2025). | In progress |
| 8 | Deadline: July 7, 2026, 23:59 AOE | Submission targeted for July 6 evening with July 7 as buffer. | On track |

## Key architecture decision (recorded July 3, 2026)

`@tokenops/sdk` is **deployed-factories-only** — it exposes no contract-deployment helpers and is
typed exclusively for TokenOps' pre-deployed contracts. A custom claim contract therefore cannot be
"used with the TokenOps SDK". We build entirely on the SDK's audited contracts and differentiate on
product/UX (the primary judging criterion), not on contract-level changes.
