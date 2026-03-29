// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {GameToken} from "./token.sol";

contract GameTokenLocal is GameToken {
    constructor(address initialOwner) GameToken(initialOwner) {}

    function faucet(uint256 amount) external {
        _mint(msg.sender, amount);
    }
}
