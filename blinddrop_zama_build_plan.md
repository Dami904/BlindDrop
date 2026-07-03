# BlindDrop → Zama Special Bounty Build Plan (v2 — bounty-strict + audit-strict)
**Track:** Special Bounty × TokenOps — Confidential Token Distribution
**Deadline:** July 7, 2026, 23:59 AOE (≈4 days from now)
**Prize:** 2,500 cUSDT, single winner
**Bounty requirement (verbatim focus):** build a confidential airdrop/disperse application **using the TokenOps SDK**, where "recipients should be able to verify and decrypt their own allocation, while distribution amounts and recipient lists remain confidential onchain."

---

> **DECISION RECORD (July 3, Hour-1 check — PIVOT TRIGGERED):** `@tokenops/sdk` v1.1.1 is
> **deployed-factories-only** — it drives TokenOps' pre-deployed `fhe-airdrop` factory (Sepolia),
> `fhe-disperse` singleton (mainnet + Sepolia), and testnet faucet (TTT/CTTT). There are no deploy
> helpers, so a custom Merkle claim contract cannot be used "with the TokenOps SDK". Per the §0
> pivot clause: **custom contract is CUT.** We build the best possible app on the SDK's audited
> contracts — differentiation moves to product/UX: batch CSV → claim-packet generation & delivery,
> airdrop + disperse in one app, judge self-serve faucet, verify-&-decrypt screen. UX is the
> primary judging criterion, so this pivot aligns with, not against, the win condition.
> Sections below describing the custom ShieldDrop contract are superseded by this record.

## 0. Strategy: comply with the bounty first, differentiate second

Two hard constraints drive everything below:

1. **The TokenOps SDK is mandatory, not optional.** The bounty says "using the TokenOps SDK." A fully custom stack — however good — risks being ruled off-track. So: the SDK is used for what it's for (recipient-list ingestion, client-side encryption, disperse/claim UX plumbing, EIP-712 user decryption), and the differentiation lives in the **contract-level trust model** underneath it.
   - **Day 0 action (before any code):** read the actual bounty rules page / TokenOps SDK docs, confirm exactly which SDK surfaces are expected, and record the compliance mapping in `docs/BOUNTY_COMPLIANCE.md`. If the rules require the reference contract itself (not just the SDK), pivot to "reference contract + hardening + superior UX" and drop the custom claim mechanism entirely. Decide this in the first hour.

2. **Recipient-list confidentiality is the bounty's headline requirement.** The design must make "the list never appears on-chain" a *feature with a precise boundary*, not a concession.

**Differentiation (kept from v1, corrected):** the audited reference (`VestingLabs/tokenops-fhe-airdrop`, OZ audit Dec 2025) uses per-claim admin EIP-712 signatures — the admin is a trusted signer for every claim, a limitation the audit explicitly accepted. We replace that with a **salted-Merkle-committed recipient list + claimed-bitmap**: only the root goes on-chain, no per-claim admin signature, no single-EOA-signer trust assumption. That answers criterion 9 (innovation) through the trust model, with *less* on-chain surface than the reference, not more.

**Dropped from v1: nullifiers.** In a transparent (non-ZK) Merkle claim, a nullifier (`keccak256(leafIndex, recipient, salt)`) adds nothing over a plain `mapping(uint256 => bool) claimed` bitmap — the claim tx already reveals the claimant and proof, so there is no anonymity set to protect. A strict auditor would flag it as unnecessary complexity and misleading (ZK-borrowed) terminology. We use the claimed-bitmap keyed by leaf index. Simpler, cheaper, and the audit story is cleaner.

---

## 1. Product: "ShieldDrop" — Confidential Airdrop with a Private Recipient List

**One-line pitch:** A confidential token distribution app (TokenOps SDK + ERC-7984 + FHEVM) where amounts stay encrypted end-to-end **and the recipient list itself never appears on-chain** — eligibility is a salted Merkle root plus per-recipient proofs delivered privately, with no per-claim admin signature.

### Visible features (exactly 3)
1. **Create Distribution** — admin uploads recipient list (address + amount). The app (via TokenOps SDK where applicable): encrypts each amount client-side, builds a **salted** Merkle tree client-side (salts random per leaf), stores amounts as contract-owned encrypted values at funding time (see §2 ciphertext model), and puts **only the Merkle root on-chain**. The app then produces per-recipient **claim packets** (leaf salt + Merkle proof + leaf index) as individually downloadable/shareable links — the full tree is never published anywhere.
2. **Claim** — recipient connects wallet, pastes/loads their claim packet, submits proof on-chain; contract verifies inclusion against the root, checks the claimed-bitmap, marks claimed, and executes a confidential ERC-7984 transfer of their (encrypted) amount.
3. **Verify & Decrypt My Allocation** — recipient uses the EIP-712 user-decryption flow (TokenOps SDK / Zama relayer SDK) to verify and reveal their own allocation client-side. Nobody else — including the admin post-distribution — can decrypt it. This is the bounty's verbatim requirement; name the screen accordingly.

### Confidentiality boundary (stated exactly — this is the audit-grade version)
- **Hidden on-chain:** individual allocation amounts (FHE-encrypted), the recipient list (only a salted Merkle root is on-chain; salted leaves mean the root cannot be dictionary-tested against candidate addresses), total per-recipient distribution amounts.
- **Hidden off-chain:** the full list is never published — each recipient receives only their own claim packet. Compromise of one packet reveals one leaf, not the list.
- **NOT hidden (state precisely, don't overclaim):** a claiming address reveals *itself* at claim time (inherent to any non-ZK claim); the existence and timing of claim transactions; sender/recipient addresses on ERC-7984 transfer events (inherent to ERC-7984, identical to the reference system); the total funded pool if funded via a public wrap. Residual leak model goes in `THREAT_MODEL.md` verbatim.
- **Net claim vs. reference:** the reference exposes the same claim-time address leak but *additionally* trusts an admin signer per claim; we expose strictly less.

### Audit-hardening baseline (pre-apply every OZ finding on the reference — cite each in SECURITY.md)
- `setPaused(bool)` instead of `togglePause()` (OZ flagged toggle race condition)
- Distinct `InsufficientBalance()` vs `ZeroBalance()` custom errors (OZ flagged conflation)
- `@custom:security-contact` NatSpec on every contract
- Claim window cannot be extended after it has ended (OZ *accepted* this risk in the reference; we fix it and say why)
- The "withdraw other confidential token" `allowTransient` leakage vector (OZ's one medium): **omit the function entirely** — not core to the MVP; document as a scoping decision
- No duplicate internal logic (OZ flagged duplication in the reference) — extract shared internals from day one
- Role separation as in the audited reference: `DEFAULT_ADMIN_ROLE` (fund, pause, post-deadline sweep) isolated from `FEE_COLLECTOR_ROLE`
- CREATE3-deterministic factory: **out of scope** (single-chain demo; removes a complex subsystem there's no time to get right). Documented as a decision, not an oversight.

---

## 2. Architecture

### The ciphertext model — decided up front, because it shapes everything
FHEVM external encrypted inputs are bound to a *(contract, caller)* pair via input proofs. The **admin** encrypts at creation, but the **recipient** sends the claim tx — so ciphertext handles cannot be committed in Merkle leaves and replayed by recipients. Therefore:

- **At funding time (admin tx):** admin submits encrypted amounts as external inputs *in the admin's own tx*; the contract converts them to contract-owned `euint64` state (`FHE.fromExternal` → `FHE.allowThis`), stored in a `mapping(uint256 leafIndex => euint64 amount)`. The Merkle leaf is `keccak256(leafIndex, recipient, salt)` — **addresses and salts only, no ciphertext in the leaf**.
- **At claim time (recipient tx):** contract verifies the Merkle proof for `(leafIndex, msg.sender, salt)`, checks/sets the claimed bitmap, then transfers `amounts[leafIndex]` confidentially and grants the recipient decryption permission (`FHE.allow(amount, msg.sender)`).
- **Trade-off stated honestly in THREAT_MODEL.md:** the *number of recipients* (mapping writes at funding) is visible on-chain; addresses and amounts are not. Batch funding in one tx.

### Tooling: Hardhat, not Foundry
Zama's FHEVM tooling, mocks, templates, and the TokenOps SDK are Hardhat-first; Foundry FHE support is experimental. With 4 days, we take the paved road: **Hardhat + Zama's FHEVM Hardhat plugin** (mocked FHE for fast unit tests, Sepolia for integration). This also removes the v1 risk that a Foundry "fork test against the coprocessor" simply doesn't work.

```
contracts/
├── ShieldDrop.sol                  # fund (encrypted inputs → contract-owned euint64s),
│                                   # claim (salted merkle + claimed bitmap), setPaused, sweep
├── interfaces/IShieldDrop.sol
└── test/ConfidentialToken.sol      # ERC-7984 demo token (OZ confidential-contracts), mintable for judges

test/
├── ShieldDrop.test.ts              # unit: claim ok, double-claim revert, bad proof revert,
│                                   # wrong-sender revert, paused revert, window-end revert
├── ShieldDrop.props.test.ts        # property-style: Σ(claimed) ≤ funded, bitmap monotonic,
│                                   # claim idempotence — randomized over recipient sets
└── ShieldDrop.sepolia.test.ts      # integration on Sepolia against the real coprocessor + relayer

scripts/
└── deploy.ts                       # deploy + Etherscan verification

frontend/                           # Next.js; TokenOps SDK + Zama relayer SDK
├── app/create/                     # ingest list, encrypt, salted tree, fund, emit claim packets
├── app/claim/                      # load claim packet, submit proof
└── app/verify/                     # EIP-712 user-decrypt: "verify & decrypt my allocation"

docs/
├── BOUNTY_COMPLIANCE.md            # requirement-by-requirement mapping to bounty text + SDK usage
├── THREAT_MODEL.md                 # exact hidden/not-hidden boundary from §1, trust assumptions
├── SECURITY.md                     # each OZ reference-audit finding → our fix; Slither results
└── ARCHITECTURE.md                 # ciphertext model diagram, design rationale, scoping decisions
```

Merkle verification: OZ `MerkleProof.sol` directly — don't reinvent. Tree building: OZ `merkle-tree` JS lib (sorted pairs, standard leaf hashing) client-side.

---

## 3. Day-by-day (4 days, submission buffer built in)

**Day 1 — Rules check, then contracts + tests core**
- **Hour 1:** read the bounty rules page + TokenOps SDK docs; write the skeleton of `BOUNTY_COMPLIANCE.md`; confirm the SDK-usage plan (§0). If rules demand more SDK/reference-contract usage than assumed, pivot now.
- Scaffold Hardhat + `@fhevm/solidity` + `@openzeppelin/confidential-contracts` + FHEVM Hardhat plugin; confirm mocked FHE tests run.
- Write `ShieldDrop.sol` per §2: fund (external inputs → owned euint64s), claim (salted merkle + bitmap + `msg.sender` binding), setPaused, post-window sweep.
- Unit tests: claim success, double-claim, invalid proof, claim as wrong sender, paused, window-ended. Green test run before sleep.

**Day 2 — Frontend + FHEVM integration**
- TokenOps SDK integration on create/claim/verify flows; Zama relayer SDK for encryption + EIP-712 user decryption.
- Salted tree generation + per-recipient claim-packet export (download/link), never a published tree.
- Three screens only — Create → Claim → Verify. No scope creep.
- Deploy to Sepolia, verify on Etherscan, run the Sepolia integration test against the real coprocessor.

**Day 3 — Security hardening + docs + CI**
- Confirm every §1 hardening item is in and tested (each one gets a test).
- Property tests (Σ claimed ≤ funded; bitmap monotonicity) over randomized recipient sets.
- Slither run; every finding fixed or documented in SECURITY.md.
- GitHub Actions: compile → test → coverage → Slither on every push; badges in README.
- Finish THREAT_MODEL.md, ARCHITECTURE.md, SECURITY.md, BOUNTY_COMPLIANCE.md — cite the OZ TokenOps audit as the security baseline, finding by finding.

**Day 4 — Polish, video, submission (finish July 6 evening; July 7 is pure buffer)**
- UX pass: loading states, error messages, empty states, claim-packet UX (the private-list story must be *felt* in the UI).
- 3-minute demo video: lead with the two bounty requirements — recipient verifies & decrypts own allocation; list and amounts never on-chain — then the trust-model differentiation (no per-claim admin signature).
- Final README: problem, architecture diagram, SDK-usage summary, how to run tests, deployed + verified addresses, explicit out-of-scope list with reasons.
- Submit with buffer to spare.

---

## 4. Mapped against the 10 criteria

| # | Criterion | How this plan covers it |
|---|---|---|
| 1 | Core functionality / completeness | 3 features, end-to-end on Sepolia, bounty requirements mapped 1:1 in BOUNTY_COMPLIANCE.md |
| 2 | Technical execution & correctness | Hardhat unit + property tests on FHE mocks; Sepolia integration test against real coprocessor + relayer |
| 3 | Architecture & code quality | Role separation, no duplicated internals, claimed-bitmap over nullifier (justified), CREATE3 explicitly cut with rationale |
| 4 | Security posture | Every OZ reference-audit finding pre-applied or the function omitted; exact threat boundary; Slither clean or documented; no ZK-theater |
| 5 | Documentation accuracy | Four docs match code exactly; confidentiality claims stated with their precise residual leaks — no overclaiming |
| 6 | Test coverage & rigor | Unit + property + live-Sepolia integration; per-hardening-item tests; coverage in CI |
| 7 | CI/CD & deploy readiness | GitHub Actions pipeline, verified Sepolia deployment, deploy script |
| 8 | UX / polish | Full Day 4; claim-packet flow makes the privacy story tangible in the UI |
| 9 | Innovation / hackathon fit | Private-list (salted-root + private claim packets) + no per-claim admin signature vs. the reference — strictly less trust and less on-chain surface, built *with* the required SDK |
| 10 | Submission readiness | Video + README + compliance doc + verified contract + working demo, a day of buffer |

---

## 5. Risks, honestly

1. **Bounty-rules mismatch (highest impact, checked first).** If the rules require deeper TokenOps SDK/reference-contract usage than the blog post implies, the Day 1 Hour-1 check catches it while a pivot is still cheap.
2. **FHEVM learning curve.** `euint64`, `FHE.allow`/`allowThis`, input proofs are new syntax even if the privacy reasoning is familiar. Fallback: if Day 1 contract work is shaky by evening, reduce the Verify screen to the bare SDK example flow and move the saved time into tests — a minimal-but-correct decrypt screen beats a broken polished one.
3. **Relayer/coprocessor flakiness on Sepolia.** Integration test may be slow or intermittent; keep it out of the CI required path (run it manually + record it in the video) so CI stays green.
4. **Claim-packet delivery UX.** Distributing per-recipient packets privately is the one genuinely new UX surface. Keep v1 dead simple: downloadable JSON per recipient + paste-in on the claim screen. Anything fancier (email, links with tokens) is out of scope.
