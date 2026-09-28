// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IDemoKRW {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
}

/// @notice HQ allocates a shared DemoKRW reserve; per-branch operators can pay approved suppliers.
contract AgentBudgetVault {
    struct Policy {
        address operator;
        uint128 budget;
        uint128 spent;
        uint64 expiresAt;
        uint32 version;
        bool active;
    }

    IDemoKRW public immutable token;
    address public immutable owner;
    uint256 public reservedAmount;
    mapping(bytes32 policyId => Policy policy) public policies;
    mapping(bytes32 policyId => mapping(address supplier => bool allowed)) public allowedSuppliers;
    mapping(bytes32 policyId => address[] suppliers) private policySuppliers;
    mapping(bytes32 orderId => bool used) public settledOrders;

    error Unauthorized();
    error InvalidPolicy();
    error PolicyExpired();
    error PolicyStopped();
    error SupplierNotAllowed();
    error BudgetExceeded();
    error OrderAlreadySettled();
    error TreasuryInsufficient();
    error TransferFailed();
    error InvalidOrder();

    event TreasuryFunded(address indexed funder, uint256 amount);
    event PolicyUpdated(bytes32 indexed policyId, address indexed operator, uint128 budget, uint64 expiresAt, uint32 version, address[] suppliers);
    event PolicyRevoked(bytes32 indexed policyId, uint32 version);
    event PaymentExecuted(bytes32 indexed policyId, bytes32 indexed orderId, address indexed supplier, uint256 subtotal, uint256 deliveryFee, uint256 total, uint32 policyVersion, bytes32 detailsHash);

    constructor(address tokenAddress) {
        if (tokenAddress == address(0)) revert InvalidPolicy();
        token = IDemoKRW(tokenAddress);
        owner = msg.sender;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    function fundTreasury(uint256 amount) external onlyOwner {
        if (!token.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
        emit TreasuryFunded(msg.sender, amount);
    }

    function setPolicy(
        bytes32 policyId,
        address operator,
        uint128 budget,
        uint64 expiresAt,
        address[] calldata suppliers
    ) external onlyOwner {
        if (policyId == bytes32(0) || operator == address(0) || budget == 0 || expiresAt <= block.timestamp || suppliers.length == 0 || suppliers.length > 20) revert InvalidPolicy();

        Policy storage current = policies[policyId];
        if (budget < current.spent) revert BudgetExceeded();
        uint256 oldReserve = current.active ? uint256(current.budget - current.spent) : 0;
        uint256 newReserve = uint256(budget - current.spent);
        uint256 balance = token.balanceOf(address(this));
        if (balance < reservedAmount || balance - reservedAmount + oldReserve < newReserve) revert TreasuryInsufficient();

        reservedAmount = reservedAmount - oldReserve + newReserve;
        address[] storage previousSuppliers = policySuppliers[policyId];
        for (uint256 i; i < previousSuppliers.length; ++i) allowedSuppliers[policyId][previousSuppliers[i]] = false;
        delete policySuppliers[policyId];
        for (uint256 i; i < suppliers.length; ++i) {
            if (suppliers[i] == address(0)) revert InvalidPolicy();
            allowedSuppliers[policyId][suppliers[i]] = true;
            policySuppliers[policyId].push(suppliers[i]);
        }
        current.operator = operator;
        current.budget = budget;
        current.expiresAt = expiresAt;
        current.version += 1;
        current.active = true;
        emit PolicyUpdated(policyId, operator, budget, expiresAt, current.version, suppliers);
    }

    function revokePolicy(bytes32 policyId) external onlyOwner {
        Policy storage current = policies[policyId];
        if (current.version == 0 || !current.active) revert InvalidPolicy();
        reservedAmount -= uint256(current.budget - current.spent);
        current.active = false;
        current.version += 1;
        emit PolicyRevoked(policyId, current.version);
    }

    function pay(
        bytes32 policyId,
        bytes32 orderId,
        address supplier,
        uint128 subtotal,
        uint128 deliveryFee,
        bytes32 detailsHash
    ) external {
        Policy storage current = policies[policyId];
        if (msg.sender != current.operator) revert Unauthorized();
        if (!current.active) revert PolicyStopped();
        if (block.timestamp >= current.expiresAt) revert PolicyExpired();
        if (!allowedSuppliers[policyId][supplier]) revert SupplierNotAllowed();
        if (orderId == bytes32(0) || supplier == address(0) || detailsHash == bytes32(0) || subtotal == 0) revert InvalidOrder();
        if (settledOrders[orderId]) revert OrderAlreadySettled();

        uint256 total = uint256(subtotal) + uint256(deliveryFee);
        if (total > type(uint128).max || uint256(current.spent) + total > current.budget) revert BudgetExceeded();
        settledOrders[orderId] = true;
        current.spent += uint128(total);
        reservedAmount -= total;
        if (!token.transfer(supplier, total)) revert TransferFailed();
        emit PaymentExecuted(policyId, orderId, supplier, subtotal, deliveryFee, total, current.version, detailsHash);
    }
}
