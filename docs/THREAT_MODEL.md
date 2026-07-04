# Threat Model — BlindDrop

BlindDrop is a frontend/product layer over TokenOps' audited FHEVM contracts
(`fhe-airdrop` clones from the TokenOps factory, `fhe-disperse` singleton) on Sepolia,
driven exclusively through `@tokenops/sdk`. This document states exactly what is and is not
confidential, and who must be trusted for what. Claims are scoped precisely — nothing here
is aspirational.

## What is confidential

| Data | Where it would otherwise leak | How it stays hidden |
|---|---|---|
| Individual allocation amounts | Calldata, contract storage, events | FHE-encrypted client-side (`euint64` external inputs with Zama input proofs); stored and transferred as ciphertext handles via ERC-7984. Plaintext never leaves the encrypting browser. |
| The recipient list as a whole | Contract storage / published artifacts | Never on-chain and never published. Claim authorizations are EIP-712 signatures issued by the admin off-chain; each recipient receives only their own claim packet. No global artifact enumerates recipients. |
| A recipient's balance | ERC-7984 balance queries | `confidentialBalanceOf` returns a ciphertext handle. Only the balance owner can decrypt it, via the Zama EIP-712 user-decryption flow (wallet signature required). The admin cannot decrypt recipient balances post-distribution. |

## What is NOT confidential (stated, not hidden)

- **A claiming address reveals itself at claim time.** The claim transaction's sender is public. This is inherent to any design where recipients claim from their own wallet, including the audited TokenOps reference. Addresses that never claim are never revealed.
- **ERC-7984 transfer events expose sender and recipient addresses** (amounts stay encrypted). Inherent to the ERC-7984 standard.
- **Claim timing and count.** Observers can count claim transactions against a campaign contract.
- **Campaign metadata**: token address, claim window, admin address, funded pool events.

## Trust assumptions

1. **TokenOps contracts** — audited by OpenZeppelin (Dec 2025: 1 medium, 3 low, 3 notes; substantially resolved). We deploy clones from their factory and add no contract code, so the audit applies to what we run. The known accepted limitation: the admin is a **trusted issuer** of claim authorizations (a malicious admin could issue none, or wrong amounts). BlindDrop does not change this; it is the reference design's trust model.
2. **The admin's browser** — plaintext amounts and the full recipient list exist client-side during campaign creation. A compromised admin machine leaks the list. BlindDrop never transmits the list to any server (no backend; all SDK calls go wallet→chain / browser→Zama relayer). Sealed claim authorizations are also persisted in the admin's browser storage (localStorage) so the admin can return to track claim status without re-signing — same custody class as the downloadable report, and cleared the same way (explicit "Clear stored packets" / "Start a new campaign" actions).
3. **Zama relayer/coprocessor network** — availability and correctness of FHE operations and user decryption, per the Zama Protocol's own trust model. The relayer cannot decrypt arbitrary values; user decryption requires the owner's EIP-712 signature.
4. **Claim-packet delivery channel** — packets are bearer-ish: a packet reveals one recipient's (encrypted) authorization and, to its holder, that recipient's inclusion. The claim itself can only be executed to the bound recipient (input proof binds `(contract, recipient)`; the contract pays out to the authorized recipient), so a stolen packet leaks membership of one address but cannot redirect funds. Deliver packets over private channels.

## Out of scope / explicitly not claimed

- No mixing/anonymity for claim transactions (no relayer-submitted claims, no ZK anonymity set).
- No protection against an admin who mis-issues allocations.
- Mainnet deployment (Sepolia only for this submission; `fhe-disperse` also exists on mainnet).
