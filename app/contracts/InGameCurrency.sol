// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract InGameCurrency is Ownable {
    mapping(address => uint256) public balanceOf;
    mapping(address => bool) public isSpender;

    event SpenderSet(address indexed spender, bool allowed);
    event Minted(address indexed to, uint256 amount);
    event Spent(address indexed from, address indexed spender, uint256 amount);
    event MovedBySpender(address indexed spender, address indexed from, address indexed to, uint256 amount);

    error NotSpender();
    error InsufficientBalance();

    constructor(address owner_) Ownable(owner_) {}

    function setSpender(address spender, bool allowed) external onlyOwner {
        isSpender[spender] = allowed;
        emit SpenderSet(spender, allowed);
    }

    function mint(address to, uint256 amount) external onlyOwner {
        balanceOf[to] += amount;
        emit Minted(to, amount);
    }

    function spendFrom(address from, uint256 amount) external {
        if (!isSpender[msg.sender]) revert NotSpender();
        uint256 b = balanceOf[from];
        if (b < amount) revert InsufficientBalance();
        unchecked {
            balanceOf[from] = b - amount;
        }
        emit Spent(from, msg.sender, amount);
    }

    function moveBySpender(address from, address to, uint256 amount) external {
        if (!isSpender[msg.sender]) revert NotSpender();
        uint256 b = balanceOf[from];
        if (b < amount) revert InsufficientBalance();
        unchecked {
            balanceOf[from] = b - amount;
        }
        balanceOf[to] += amount;
        emit MovedBySpender(msg.sender, from, to, amount);
    }
}
