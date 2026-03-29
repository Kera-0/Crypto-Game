// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {InGameCurrency} from "./InGameCurrency.sol";

contract InGameCurrencyLocal is InGameCurrency {
    constructor(address owner_) InGameCurrency(owner_) {}

    function faucet(uint256 amount) external {
        balanceOf[msg.sender] += amount;
        emit Minted(msg.sender, amount);
    }
}
