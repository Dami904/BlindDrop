// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IConfidentialAirdrop
/// @notice Minimal read-only interface onto TokenOps' cloneable confidential-airdrop contract
///         (`confidentialAirdropCloneableAbi`, as published in the TokenOps SDK package), used
///         only to verify that the caller of {BlindDropRegistry-registerCampaign} actually
///         administers the campaign it is registering.
/// @dev The TokenOps airdrop clone does not expose a bare `admin()` getter — administration is
///      modeled with OpenZeppelin AccessControl, where the admin holds `DEFAULT_ADMIN_ROLE`
///      (the zero role, `bytes32(0)`). This interface mirrors exactly those two functions from
///      the real ABI so the registry can ask "does `msg.sender` hold the admin role on this
///      campaign?" without depending on the full TokenOps contract or any external package.
interface IConfidentialAirdrop {
    /// @notice Returns the role identifier that gates administrative actions on the campaign.
    /// @dev On the TokenOps cloneable airdrop this is OpenZeppelin AccessControl's
    ///      `DEFAULT_ADMIN_ROLE`, a constant equal to `bytes32(0)`.
    function DEFAULT_ADMIN_ROLE() external view returns (bytes32);

    /// @notice Returns whether `account` holds `role` on the campaign.
    function hasRole(bytes32 role, address account) external view returns (bool);
}
