pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "./Ownable.sol";

contract GameToken is ERC20, Ownable {
    address public game;
    address public pvpBattles;

    constructor(address initialOwner) ERC20("Game Gold", "YNGK") Ownable(initialOwner) {}

    function setGame(address gameAddress) external onlyOwner {
        game = gameAddress;
    }

    function setPvpBattles(address pvp) external onlyOwner {
        pvpBattles = pvp;
    }

    function mintPvpReward(address to, uint256 amount) external {
        require(msg.sender == pvpBattles && pvpBattles != address(0), "Only PvP");
        _mint(to, amount);
    }

    modifier onlyGame() {
        require(msg.sender == game, "Only game");
        _;
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlyOwner {
        _burn(from, amount);
    }

    function gameTransfer(address to, uint256 amount) external onlyGame returns (bool) {
        _transfer(address(this), to, amount);
        return true;
    }
}
