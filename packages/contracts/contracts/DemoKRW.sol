// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Test-only integer-token ledger. One token unit is one simulated KRW.
contract DemoKRW {
    string public constant name = "DemoKRW";
    string public constant symbol = "DKRW";
    uint8 public constant decimals = 0;

    address public immutable owner;
    uint256 public totalSupply;
    mapping(address account => uint256) public balanceOf;
    mapping(address owner_ => mapping(address spender => uint256)) public allowance;

    error Unauthorized();
    error InvalidAddress();
    error InsufficientBalance();
    error InsufficientAllowance();

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor() {
        owner = msg.sender;
    }

    function mint(address recipient, uint256 amount) external {
        if (msg.sender != owner) revert Unauthorized();
        if (recipient == address(0)) revert InvalidAddress();
        totalSupply += amount;
        balanceOf[recipient] += amount;
        emit Transfer(address(0), recipient, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        if (spender == address(0)) revert InvalidAddress();
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address recipient, uint256 amount) external returns (bool) {
        _transfer(msg.sender, recipient, amount);
        return true;
    }

    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool) {
        uint256 currentAllowance = allowance[sender][msg.sender];
        if (currentAllowance < amount) revert InsufficientAllowance();
        if (currentAllowance != type(uint256).max) allowance[sender][msg.sender] = currentAllowance - amount;
        _transfer(sender, recipient, amount);
        return true;
    }

    function _transfer(address sender, address recipient, uint256 amount) private {
        if (recipient == address(0)) revert InvalidAddress();
        if (balanceOf[sender] < amount) revert InsufficientBalance();
        balanceOf[sender] -= amount;
        balanceOf[recipient] += amount;
        emit Transfer(sender, recipient, amount);
    }
}
