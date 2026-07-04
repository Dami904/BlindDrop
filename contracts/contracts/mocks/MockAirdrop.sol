// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MockAirdrop
/// @notice Test double for the TokenOps confidential-airdrop clone. Mirrors the two
///         AccessControl-style getters (`DEFAULT_ADMIN_ROLE`, `hasRole`) that
///         {BlindDropRegistry-registerCampaign} relies on to verify campaign admins, without
///         pulling in the full TokenOps/OpenZeppelin AccessControl dependency tree.
/// @dev Not used in production; test-only fixture.
contract MockAirdrop {
    bytes32 public constant DEFAULT_ADMIN_ROLE = bytes32(0);

    address private immutable _admin;

    constructor(address admin_) {
        _admin = admin_;
    }

    function hasRole(bytes32 role, address account) external view returns (bool) {
        return role == DEFAULT_ADMIN_ROLE && account == _admin;
    }
}
