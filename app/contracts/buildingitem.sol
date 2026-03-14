pragma solidity ^0.8.28;

import {Ownable} from "./Ownable.sol";

interface IBuildingMarketplace {
    function list(uint256 tokenId, uint256 price) external;
}


contract BuildingItem is Ownable {
    constructor() Ownable(msg.sender) {
        buildings.push();
    }

    struct Building {
        uint64 dna;              // первые 5 битов - тип здания (казарма, шахта и тд), следующие 9 - маска для формы здания внутри квадрата 3x3, остальные 50 - внешний вид TODO
        uint32 level;            // уровень здания
        uint256 updateReadyTime;  // время до взаимодействия со зданием
        bool isActive;           // расположен ли нфт на поле или лежит в инвентаре
    }

    Building[] public buildings;

    mapping (uint256 => address) public buildingToOwner;
    mapping(address => uint256[]) public ownerToBuildingIds;
    mapping(uint256 => uint256) public buildingIdToOwnerIndex;
    
    IBuildingMarketplace public marketplace;

    function setMarketplace(address m) external onlyOwner {
        marketplace = IBuildingMarketplace(m);
    }

    modifier onlyMarketplace() { 
        require(msg.sender == address(marketplace));
        _; 
    }
    
    function _addBuildingToOwner(address owner, uint256 buildingId) internal {
        buildingToOwner[buildingId] = owner;
        ownerToBuildingIds[owner].push(buildingId);
        buildingIdToOwnerIndex[buildingId] = ownerToBuildingIds[owner].length - 1;
    }

    function transferForMarketplace(address from, address to, uint256 tokenId) external onlyMarketplace {
        require(buildingToOwner[tokenId] == from);
        
        uint256 lastIndex = ownerToBuildingIds[from].length - 1;
        uint256 index = buildingIdToOwnerIndex[tokenId];
        
        if (lastIndex != index) {
            uint256 lastBuildingId = ownerToBuildingIds[from][lastIndex];
            ownerToBuildingIds[from][index] = lastBuildingId;
            buildingIdToOwnerIndex[lastBuildingId] = index;
        }

        ownerToBuildingIds[from].pop();

        _addBuildingToOwner(to, tokenId);
    }

    function getBuildingsByOwner(address owner, bool onlyActive) external view returns (Building[] memory) {
        uint256[] storage ids = ownerToBuildingIds[owner];

        uint256 count = 0;
        for (uint256 i = 0; i < ids.length; i++) {
            if (!onlyActive || buildings[ids[i]].isActive) {
                count++;
            }
        }

        Building[] memory res = new Building[](count);
        uint256 index = 0;

        for (uint256 i = 0; i < ids.length; i++) {
            if (!onlyActive || buildings[ids[i]].isActive) {
                res[index] = buildings[ids[i]];
                index++;
            }
        }

        return res;
    }

    function _getBuildingType(uint64 dna) internal pure returns (uint8) {
        return uint8(dna & 0x1F);
    }

    function _getBuildingShapeMask(uint64 dna) internal pure returns (uint16) {
        return uint16((dna >> 5) & 0x1FF);
    }

    function _hasShapeBit(uint16 mask, uint8 row, uint8 col) internal pure returns (bool) {
        uint8 shift = 8 - (row * 3 + col);
        return ((mask >> shift) & 1) == 1;
    }


    function ownerOf(uint256 tokenId) external view returns (address) {
        return buildingToOwner[tokenId];
    }
}