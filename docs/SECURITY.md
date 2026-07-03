# Security — BlindDrop

## Posture summary

BlindDrop deliberately ships **zero custom smart-contract code**. Every on-chain operation runs on
TokenOps' pre-deployed contracts — the `fhe-airdrop` factory and clones and the `fhe-disperse`
singleton — audited by
[OpenZeppelin (Dec 2025)](https://www.openzeppelin.com/news/tokenops-zama-confidential-airdrop-audit)
(1 medium, 3 low, 3 notes; substantially resolved). The audit therefore applies directly to what
BlindDrop executes, and the app cannot introduce contract-level vulnerabilities.

The remaining security surface is the client, reviewed below.

## Client-side review

| Area | Design decision | Rationale |
|---|---|---|
| Recipient list handling | Never transmitted anywhere; exists only in the admin's browser memory during creation | No backend to breach; smallest possible exposure surface |
| Claim packets | Contain only: airdrop address, chain id, token, recipient, encrypted handle + input proof, admin signature — no plaintext amount, no private keys | A leaked packet reveals one address's membership; it cannot redirect funds (input proof is bound to `(contract, recipient)` at encrypt time and the contract pays only the authorized recipient) |
| Packet validation | Hand-rolled strict type guard (`src/lib/packet.ts`): shape, hex formats, address regex, chain id — rejects anything malformed before any SDK call | Untrusted input (file upload / paste) is fully validated at the boundary |
| Wallet/recipient binding | `/claim` hard-blocks unless the connected wallet equals the packet's recipient (case-insensitive compare) | Prevents confusing failures and makes the packet's binding explicit to users |
| Chain guard | Every transacting page verifies Sepolia (11155111) and offers a switch before enabling actions | Prevents wrong-network transactions |
| Encryption binding | `encryptUint64` is always called with `userAddress = recipient` (not the admin) | Zama input proofs commit to `(contractAddress, userAddress)`; `FHE.fromExternal` rejects any other binding — enforced by construction in the create flow |
| Amount handling | Amounts validated (positive, numeric) and scaled to 6 decimals in one shared pure function used by all input modes (CSV, paste, manual) | Single validation path; no mode can bypass checks |
| Decryption | Only via Zama's EIP-712 user-decryption; requires the balance owner's wallet signature per decryption | The app cannot decrypt anyone's balance; neither can the admin |
| Dependencies | `@tokenops/sdk` (BSD-3-Clause-Clear, published by TokenOps/VestingLabs), `@zama-fhe/sdk` — both first-party to the platforms being targeted | No unvetted crypto dependencies |

## Known limitations (stated, not hidden)

Inherited from the audited TokenOps design and the ERC-7984 standard — see
[THREAT_MODEL.md](THREAT_MODEL.md) for the full boundary:

1. The admin is a trusted issuer of claim authorizations (audit-accepted limitation of the
   reference design).
2. Claiming addresses self-reveal at claim time; transfer events expose addresses (amounts stay
   encrypted).
3. Claim-packet delivery security is the admin's responsibility; packets should be sent over
   private channels.

## Reporting

Security contact: navigatorabraham@gmail.com
