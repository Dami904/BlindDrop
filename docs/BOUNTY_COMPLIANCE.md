# Bounty Compliance — Zama Developer Program, Special Bounty Track × TokenOps

Requirement-by-requirement mapping from the **official bounty text** to this project.

> "Create the best confidential application using the TokenOps SDK on the Zama Protocol."

| # | Official requirement | How BlindDrop satisfies it | Status |
|---|---|---|---|
| 1 | "A functioning dApp demo **using the TokenOps SDK**" | Built directly on `@tokenops/sdk@1.1.1`: `fhe-airdrop` factory client + React hooks (campaign creation, claim authorizations, claims, funding), `fhe-disperse` singleton client (registration, operator approval, preflight, disperse), `testnet-faucet` client. No forked or bypassed SDK code paths. | ✅ |
| 2 | "**Smart contract** code base" | Two layers: (a) all distribution logic runs on TokenOps' pre-deployed contracts — the same contracts [audited by OpenZeppelin](https://www.openzeppelin.com/news/tokenops-zama-confidential-airdrop-audit) (Dec 2025) — which the app instantiates via the factory; (b) a first-party contract, `contracts/BlindDropRegistry.sol` — an on-chain campaign registry (opt-in, permissionless, stores only already-public campaign metadata) with full unit tests, deployed + verified on Sepolia. | 🔄 registry in progress |
| 3 | "**Frontend** code base" | Next.js app (`app/`): 4 pages (Home + guide + faucet, Create, Claim & Verify, Disperse), Confidential Dossier design system, light/dark themes, conversational guide widget, unit-tested validation libs, CI (lint → typecheck → test → build). | ✅ |
| 4 | "Working demo **deployed on a website**" | Live on Vercel with autodeploy from `main`; COOP/COEP headers configured for Zama FHE WASM threads. | ✅ |
| 5 | "A **3-minute video** demo pitching the project (real-person pitch only; no AI video/voice)" | Script + shot list prepared; recorded by the project owner (real person, real voice). | 🔄 to record |
| 6 | "A **thread or article published on X** introducing your project" | Thread drafted (hook → problem → demo → privacy model → links); posted from the owner's account before submission. | 🔄 to post |
| 7 | "Deployment: **Sepolia testnet** or Ethereum mainnet" | Sepolia: TokenOps factory-deployed campaign clones, disperse singleton, faucet token pair, and the BlindDropRegistry. | ✅ |

## Bounty theme fit

> "Public blockchains still leak sensitive financial data — making airdrops, investor
> distributions, and team payouts hard to run privately at scale."

- **Airdrops** → `/create`: claim-based campaigns; amounts FHE-encrypted end-to-end; the recipient
  list never touches the chain (admin-signed claim authorizations delivered as private per-recipient
  claim packets).
- **Investor distributions / team payouts** → `/disperse`: push-based confidential batch send.
- **Recipients verify & decrypt their own allocation** → Claim & Verify page: EIP-712
  user-decryption; nobody else (including the admin, post-distribution) can read a balance.
- Works with **any ERC-7984 token** (registry-backed token picker incl. cUSDT), not a purpose-built
  mock.

Precise confidentiality boundary (incl. what is *not* hidden): [THREAT_MODEL.md](THREAT_MODEL.md).
Security posture and audit lineage: [SECURITY.md](SECURITY.md).
