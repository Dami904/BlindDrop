# BlindDrop contracts

A single first-party contract, `BlindDropRegistry`, that lets the BlindDrop frontend list an
admin's confidential-airdrop campaigns after a page reload. Everything else BlindDrop does runs on
TokenOps' own pre-deployed, audited contracts (see `/docs/SECURITY.md` at the repo root) — this is
the one piece of custom Solidity in the project.

## What it does

`BlindDropRegistry` is an opt-in, on-chain index of campaigns created via the TokenOps
`fhe-airdrop` factory:

- `registerCampaign(address campaign, address token)` — records that `msg.sender` registered
  `campaign` (a TokenOps confidential-airdrop clone address) distributing `token`. Reverts on
  zero addresses, on a duplicate `campaign`, and — when `campaign` implements the AccessControl
  admin-role getters (as the real TokenOps clone does) — on any caller that isn't that campaign's
  admin.
- `campaignCount()`, `campaignAt(uint256)`, `campaignsOf(address registrar)`,
  `campaignsSlice(uint256 from, uint256 to)` — read the index back, the last one paginated.

Every registration emits `CampaignRegistered(campaign, token, registrar, timestamp)`.

## What it deliberately does NOT store

**No amounts. No recipient addresses. No encrypted handles, proofs, or signatures.** The registry
stores exactly four fields per campaign: the campaign (clone) address, the token address, the
registrar address, and a timestamp — all of which are already public the instant a campaign is
deployed and funded. Adding this registry cannot weaken BlindDrop's confidentiality story, because
it never touches anything confidential in the first place. See `/docs/SECURITY.md` and
`/docs/THREAT_MODEL.md` in the parent repo for the full privacy boundary this project maintains.

## Why permissionless (no owner, no pause, no upgrade)

- **No owner over the registry itself.** Anyone can call `registerCampaign` for a campaign they
  administer; no privileged account can remove, alter, or gate entries. The registry can't be
  censored or rugged by whoever deploys it.
- **No pause.** Registration moves no funds and has no state that benefits from an emergency stop;
  a pause switch here would only add a censorship vector, not a safety one.
- **No upgrade path.** The data model (four fields, append-only) is simple and final enough that a
  future change is better served by a new registry deployment than by a proxy, which would
  reintroduce an admin key this contract is specifically designed not to have.

**Spam / trust model:** because registration is permissionless, the frontend must treat this
registry as an index/cache keyed by `registrar`, not as a source of truth about who controls a
campaign — see the `registerCampaign` NatSpec for the exact fallback behavior when a registered
`campaign` address doesn't implement the admin-role getters at all (e.g. an address that isn't
really a TokenOps airdrop clone).

## Admin-check interface

TokenOps' cloneable airdrop (`confidentialAirdropCloneableAbi` in `@tokenops/sdk`) does not expose
a bare `admin()` getter — it models administration with OpenZeppelin AccessControl, where the admin
holds `DEFAULT_ADMIN_ROLE` (the zero role). `IConfidentialAirdrop`
(`contracts/interfaces/IConfidentialAirdrop.sol`) mirrors exactly the two functions needed to check
that:

```solidity
interface IConfidentialAirdrop {
    function DEFAULT_ADMIN_ROLE() external view returns (bytes32);
    function hasRole(bytes32 role, address account) external view returns (bool);
}
```

`registerCampaign` calls `DEFAULT_ADMIN_ROLE()` in a `try`/`catch`; if it reverts (i.e. `campaign`
isn't an AccessControl-style contract at all), registration falls back to accepting any caller and
recording `msg.sender` as the registrar, per the spam-consideration note above.

## Build / test / deploy

```bash
cd contracts
npm install

npx hardhat compile   # clean compile, solc 0.8.24
npx hardhat test      # 24 tests, all green
```

### Deploy to Sepolia

```bash
cp .env.example .env
# fill in RPC_URL and PRIVATE_KEY in .env (never commit this file — it's gitignored)

npx hardhat run scripts/deploy.ts --network sepolia
```

`RPC_URL` and `PRIVATE_KEY` are read from `contracts/.env` via `dotenv` (loaded in
`hardhat.config.ts`) — nothing is hardcoded. Use a throwaway/deploy-only key.

### Verify on Etherscan

```bash
# add ETHERSCAN_API_KEY to contracts/.env first
npx hardhat verify --network sepolia <DEPLOYED_ADDRESS>
```

## Layout

```
contracts/
  contracts/
    BlindDropRegistry.sol
    interfaces/IConfidentialAirdrop.sol
    mocks/MockAirdrop.sol         # test fixture: implements the admin-role getters
    mocks/MockNonAirdrop.sol      # test fixture: does NOT implement them (fallback path)
  test/BlindDropRegistry.test.ts
  scripts/deploy.ts
  hardhat.config.ts
  .env.example
```
