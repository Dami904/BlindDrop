// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IConfidentialAirdrop} from "./interfaces/IConfidentialAirdrop.sol";

/// @title BlindDropRegistry
/// @author BlindDrop
/// @notice An opt-in, permissionless index of confidential airdrop campaigns created via the
///         TokenOps `fhe-airdrop` factory. It exists solely so the BlindDrop frontend can list an
///         admin's campaigns after a page reload, without a backend.
///
/// @dev Privacy by construction: this contract stores and emits ONLY data that is already public
///      the moment a TokenOps airdrop clone is deployed and its token is chosen — the clone
///      (campaign) address, the token address, the registrar (caller) address, and the block
///      timestamp of registration. It never stores or emits recipient addresses, claim amounts,
///      encrypted handles, signatures, or any other confidential or per-recipient data. Adding
///      this registry therefore cannot weaken BlindDrop's confidentiality story — see
///      /docs/SECURITY.md and /docs/THREAT_MODEL.md in the parent repository.
///
/// @dev Permissionless by design: there is no owner, no pause switch, and no upgrade path.
///      - No owner/admin over the registry itself: any address may call {registerCampaign} for a
///        campaign it administers, and no privileged account can remove or alter entries, so the
///        registry cannot be censored or rugged by its deployer.
///      - No pause: registration is a pure bookkeeping action with no funds at risk, so there is
///        nothing a pause would protect against; a pause would only add a censorship vector.
///      - No upgrade: the data model (four fields, append-only) is final and simple enough that
///        future changes are better served by deploying a new registry than by migrating state
///        through a proxy, which would reintroduce an admin key.
///      Spam consideration: because registration is permissionless, anyone can register any
///      `(campaign, token)` pair for which they hold `DEFAULT_ADMIN_ROLE` on `campaign` (or, for
///      contracts that do not implement that role at all, anyone at all — see
///      {registerCampaign}). The frontend is expected to treat this registry as an index/cache
///      keyed by `registrar`, not as a source of truth about who *actually* controls a campaign;
///      it must not use registry membership as an authorization check for claims or withdrawals.
///
/// @custom:security-contact navigatorabraham@gmail.com
contract BlindDropRegistry {
    /// @notice A single registered campaign record.
    /// @param campaign The TokenOps confidential-airdrop clone address.
    /// @param token The confidential token address distributed by `campaign`.
    /// @param registrar The address that called {registerCampaign}.
    /// @param timestamp The block timestamp at which the campaign was registered.
    struct CampaignRecord {
        address campaign;
        address token;
        address registrar;
        uint256 timestamp;
    }

    /// @dev Append-only log of every registered campaign, in registration order.
    CampaignRecord[] private _campaigns;

    /// @dev campaign address => already registered. Enforces global (not per-registrar)
    ///      uniqueness, since a given clone address can only ever have one real admin role-holder
    ///      set at deploy time.
    mapping(address campaign => bool registered) private _isRegistered;

    /// @dev registrar => campaign addresses they registered, in registration order.
    mapping(address registrar => address[] campaigns) private _campaignsByRegistrar;

    /// @notice Emitted whenever a campaign is registered.
    /// @param campaign The TokenOps confidential-airdrop clone address.
    /// @param token The confidential token address distributed by `campaign`.
    /// @param registrar The address that registered the campaign (`msg.sender`).
    /// @param timestamp The block timestamp of registration.
    event CampaignRegistered(
        address indexed campaign,
        address indexed token,
        address indexed registrar,
        uint256 timestamp
    );

    /// @notice Thrown when `campaign` has already been registered by anyone.
    error CampaignAlreadyRegistered();

    /// @notice Thrown when `campaign` exposes `DEFAULT_ADMIN_ROLE`/`hasRole` and `msg.sender`
    ///         does not hold that role on it.
    error NotCampaignAdmin();

    /// @notice Thrown when `campaign` or `token` is the zero address.
    error ZeroAddress();

    /// @notice Thrown when `from > to` is passed to {campaignsSlice}.
    error InvalidRange();

    /// @notice Thrown when an index is `>=` the current campaign count.
    error IndexOutOfRange();

    /// @notice Registers a TokenOps confidential-airdrop campaign in the public index.
    /// @dev Authorization: if `campaign` implements the AccessControl-style
    ///      `DEFAULT_ADMIN_ROLE()` / `hasRole(bytes32,address)` getters (as the TokenOps
    ///      cloneable airdrop does), the call reverts with {NotCampaignAdmin} unless
    ///      `msg.sender` holds that role on `campaign`. If the staticcall to
    ///      `DEFAULT_ADMIN_ROLE()` reverts or returns malformed data — e.g. `campaign` is not a
    ///      TokenOps airdrop clone at all — registration falls back to accepting any caller and
    ///      simply recording `msg.sender` as the registrar. This fallback is a deliberate
    ///      trade-off: it keeps the registry usable for future non-AccessControl campaign types
    ///      without a governance step, at the cost of allowing registration of arbitrary
    ///      `(campaign, token)` pairs when `campaign` doesn't support the role check. Because the
    ///      registry only ever stores public addresses and is explicitly documented as an
    ///      index/cache (see contract-level NatSpec), this cannot be used to fake claim
    ///      authorization or leak private data — at worst it pollutes the index with junk
    ///      entries, which the frontend can filter by cross-checking against the TokenOps
    ///      factory's own `AirdropCreated` events if desired.
    /// @param campaign The TokenOps confidential-airdrop clone address.
    /// @param token The confidential token address distributed by `campaign`.
    function registerCampaign(address campaign, address token) external {
        if (campaign == address(0) || token == address(0)) revert ZeroAddress();
        if (_isRegistered[campaign]) revert CampaignAlreadyRegistered();

        try IConfidentialAirdrop(campaign).DEFAULT_ADMIN_ROLE() returns (bytes32 role) {
            bool isAdmin = IConfidentialAirdrop(campaign).hasRole(role, msg.sender);
            if (!isAdmin) revert NotCampaignAdmin();
        } catch {
            // `campaign` does not implement the admin-role getters; fall back to permissionless
            // registration under the caller's own address (documented above).
        }

        _isRegistered[campaign] = true;
        _campaigns.push(
            CampaignRecord({
                campaign: campaign,
                token: token,
                registrar: msg.sender,
                timestamp: block.timestamp
            })
        );
        _campaignsByRegistrar[msg.sender].push(campaign);

        emit CampaignRegistered(campaign, token, msg.sender, block.timestamp);
    }

    /// @notice Returns the total number of registered campaigns.
    function campaignCount() external view returns (uint256) {
        return _campaigns.length;
    }

    /// @notice Returns the campaign record at `index`.
    /// @param index Zero-based index into registration order.
    function campaignAt(uint256 index) external view returns (CampaignRecord memory) {
        if (index >= _campaigns.length) revert IndexOutOfRange();
        return _campaigns[index];
    }

    /// @notice Returns the campaign addresses registered by `registrar`, in registration order.
    /// @param registrar The address to look up.
    function campaignsOf(address registrar) external view returns (address[] memory) {
        return _campaignsByRegistrar[registrar];
    }

    /// @notice Returns a paginated slice of `[from, to)` over all registered campaigns.
    /// @dev `to` is clamped to {campaignCount} so callers can safely pass a large upper bound
    ///      (e.g. `type(uint256).max`) to mean "to the end". `from` is not clamped: a `from`
    ///      greater than the current campaign count reverts with {IndexOutOfRange} rather than
    ///      silently returning an empty array, so callers can distinguish "empty registry"/
    ///      "empty range within bounds" (returns `[]`) from "start index doesn't exist" (reverts).
    /// @param from Inclusive start index.
    /// @param to Exclusive end index (clamped to {campaignCount}).
    function campaignsSlice(
        uint256 from,
        uint256 to
    ) external view returns (CampaignRecord[] memory records) {
        uint256 length = _campaigns.length;
        if (from > to) revert InvalidRange();
        if (from > length) revert IndexOutOfRange();

        uint256 end = to > length ? length : to;
        records = new CampaignRecord[](end - from);
        for (uint256 i = from; i < end; ++i) {
            records[i - from] = _campaigns[i];
        }
    }
}
