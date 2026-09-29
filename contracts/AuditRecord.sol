// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Audit commitments only. Payloads and salts stay off-chain.
contract AuditRecord {
    address public immutable owner;
    mapping(bytes32 purchaseId => bool recorded) public recordedPurchases;

    error Unauthorized();
    error InvalidRecord();
    error DuplicatePurchase();

    event PurchaseRecorded(
        bytes32 indexed purchaseId,
        bytes32 policyHash,
        bytes32 recordHash
    );

    constructor() { owner = msg.sender; }

    function recordPurchase(
        bytes32 purchaseId,
        bytes32 policyHash,
        bytes32 recordHash
    ) external {
        if (msg.sender != owner) revert Unauthorized();
        if (purchaseId == bytes32(0) || policyHash == bytes32(0) || recordHash == bytes32(0)) revert InvalidRecord();
        if (recordedPurchases[purchaseId]) revert DuplicatePurchase();
        recordedPurchases[purchaseId] = true;
        emit PurchaseRecorded(purchaseId, policyHash, recordHash);
    }
}

