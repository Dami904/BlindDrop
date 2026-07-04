// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MockNonAirdrop
/// @notice Test double for an arbitrary contract that does NOT implement the
///         `DEFAULT_ADMIN_ROLE`/`hasRole` admin-role getters, used to exercise
///         {BlindDropRegistry-registerCampaign}'s permissionless fallback path.
/// @dev Not used in production; test-only fixture.
contract MockNonAirdrop {
    // Intentionally empty: no admin-role interface implemented.
    function ping() external pure returns (bool) {
        return true;
    }
}
