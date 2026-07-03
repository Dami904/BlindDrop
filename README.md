# BlindDrop — Confidential Token Distribution

**Zama Developer Program Mainnet Season 3 — Special Bounty × TokenOps** submission.

BlindDrop is a confidential airdrop & disperse dApp on the Zama Protocol (Sepolia), built on the
[TokenOps SDK](https://www.npmjs.com/package/@tokenops/sdk). Allocation amounts are FHE-encrypted
end-to-end (ERC-7984), the recipient list never touches the chain, and every recipient can
verify and decrypt **their own** allocation — no one else can, not even the distribution admin.

## The 4-minute judge journey

1. **/faucet** — mint the TTT/CTTT test-token pair to your wallet (Sepolia).
2. **/create** — upload a CSV, paste, or type recipients manually → deploy a confidential airdrop
   campaign → the app encrypts each allocation client-side and generates per-recipient
   **claim packets** (sealed, downloadable, shareable).
3. **/claim** — as a recipient, drop your claim packet in and claim. The packet is bound to your
   address; nobody else can use it.
4. **/verify** — decrypt your own balance client-side via Zama's EIP-712 user-decryption. The
   reveal happens in your browser; the plaintext never exists anywhere else.

There is also **/disperse** — a one-shot confidential batch send (no campaign or claim step),
using the TokenOps disperse singleton.

## What stays confidential

| | On-chain | Who can see it |
|---|---|---|
| Allocation amounts | FHE ciphertext (`euint64`) | Only the owning recipient (EIP-712 user decryption) |
| Recipient list | Never on-chain | Only the admin's browser and each individual recipient |
| Balances | Ciphertext handles | Only the balance owner |

Precise boundary — including what is *not* hidden (claim-tx senders self-reveal, ERC-7984 event
addresses) — in [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md). We state limits exactly; nothing is
overclaimed.

## Architecture

- **No backend.** Pure client-side Next.js app: browser → wallet → Sepolia, browser → Zama relayer.
  The recipient list and plaintext amounts never leave the admin's browser.
- **No custom contracts.** All on-chain logic is TokenOps' pre-deployed, OpenZeppelin-audited
  contracts (`fhe-airdrop` factory clones, `fhe-disperse` singleton), driven exclusively through
  `@tokenops/sdk` — see [docs/BOUNTY_COMPLIANCE.md](docs/BOUNTY_COMPLIANCE.md) for the
  requirement-by-requirement mapping and [docs/SECURITY.md](docs/SECURITY.md) for the security review.
- **Stack:** Next.js (App Router) · wagmi + viem · `@tokenops/sdk` · `@zama-fhe/sdk` + react-sdk.

## Run it

```bash
cd app
npm ci
npm run dev        # http://localhost:3000
```

Optional: set `NEXT_PUBLIC_RPC_URL` to a Sepolia RPC endpoint (falls back to the public default).
You need a browser wallet on Sepolia with a little ETH for gas; test tokens come from **/faucet**.

CI runs lint, typecheck, and build on every push (`.github/workflows/ci.yml`).

## Docs

- [docs/BOUNTY_COMPLIANCE.md](docs/BOUNTY_COMPLIANCE.md) — bounty requirement mapping
- [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) — exact confidentiality boundary & trust assumptions
- [docs/SECURITY.md](docs/SECURITY.md) — security posture & audit lineage
