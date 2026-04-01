// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {CityFiled} from "./city.sol";

contract CityFiledLocal is CityFiled {
    mapping(address => bool) public starterClaimed;

    constructor(address tokenAddress) CityFiled(tokenAddress) {}

    function claimStarterBuildings() external {
        require(!starterClaimed[msg.sender], "Starter already claimed");
        starterClaimed[msg.sender] = true;

        _mintStarterBuilding(msg.sender, 0, 0x007, 1);
        _mintStarterBuilding(msg.sender, 0, 0x00B, 2);
        _mintStarterBuilding(msg.sender, 1, 0x00F, 3);
        _mintStarterBuilding(msg.sender, 1, 0x013, 4);
        _mintStarterBuilding(msg.sender, 2, 0x00F, 5);
        _mintStarterBuilding(msg.sender, 2, 0x013, 6);
    }

    function _mintStarterBuilding(address to, uint8 buildingType, uint16 shapeMask, uint64 lookSeed) internal {
        uint64 dna = uint64(buildingType) | (uint64(shapeMask) << SHAPE_SHIFT) | (lookSeed << LOOK_SHIFT);
        buildings.push(Building(dna, 1, block.timestamp, false));
        uint256 id = buildings.length - 1;
        _addBuildingToOwner(to, id);
    }
}
