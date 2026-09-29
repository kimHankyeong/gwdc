// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice 해시 기록 계약입니다. 실제 구매나 원문의 진실성을 증명하지 않습니다.
contract AuditRecord {
    address public owner;
    address public pendingOwner;
    bool public paused;
    mapping(bytes32 purchaseId => bool recorded) public recordedPurchases;

    error Unauthorized();
    error InvalidRecord();
    error DuplicatePurchase();
    error Paused();
    error InvalidOwner();

    event PurchaseRecorded(bytes32 indexed purchaseId, bytes32 policyHash, bytes32 recordHash);
    event OwnershipTransferStarted(address indexed nextOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed nextOwner);
    event PauseChanged(bool paused);

    constructor() { owner = msg.sender; }

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    // 주소 오입력으로 즉시 권한을 잃지 않도록 새 소유자가 직접 수락합니다.
    function transferOwnership(address nextOwner) external onlyOwner {
        if (nextOwner == address(0) || nextOwner == owner) revert InvalidOwner();
        pendingOwner = nextOwner;
        emit OwnershipTransferStarted(nextOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert Unauthorized();
        address previousOwner = owner;
        owner = msg.sender;
        pendingOwner = address(0);
        emit OwnershipTransferred(previousOwner, owner);
    }

    function setPaused(bool value) external onlyOwner {
        paused = value;
        emit PauseChanged(value);
    }

    function recordPurchase(bytes32 purchaseId, bytes32 policyHash, bytes32 recordHash) external onlyOwner {
        if (paused) revert Paused();
        if (purchaseId == bytes32(0) || policyHash == bytes32(0) || recordHash == bytes32(0)) {
            revert InvalidRecord();
        }
        if (recordedPurchases[purchaseId]) revert DuplicatePurchase();
        recordedPurchases[purchaseId] = true;
        emit PurchaseRecorded(purchaseId, policyHash, recordHash);
    }
}
