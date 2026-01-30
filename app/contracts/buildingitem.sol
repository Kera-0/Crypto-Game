pragma solidity ^0.8.28;

import {Ownable} from "./Ownable.sol";

interface IBuildingMarketplace {
    function list(uint256 tokenId, uint256 price) external;
}


contract BuildingItem is Ownable {
    constructor() Ownable(msg.sender) {}

    struct Building {
        uint64 dna;              // первые 5 битов - тип здания (казарма, шахта и тд), следующие 9 - маска для формы здания внутри квадрата 3x3, остальные 50 - внешний вид TODO
        uint32 level;            // уровень здания
        uint32 updateReadyTime;  // время до взаимодействия со зданием
        bool isActive;           // расположен ли нфт на поле или лежит в инвентаре
    }

    Building[] public buildings;

    mapping (uint256 => address) public buildingToOwner;
    mapping (address => uint32) ownerBuildingCount;
    
    IBuildingMarketplace public marketplace;

    function setMarketplace(address m) external onlyOwner {
        marketplace = IBuildingMarketplace(m);
    }

    modifier onlyMarketplace() { 
        require(msg.sender == address(marketplace));
        _; 
    }
    
    function transferForMarketplace(address from, address to, uint256 tokenId) external onlyMarketplace {
        ownerBuildingCount[to]++;
        ownerBuildingCount[from]--;
        buildingToOwner[tokenId] = to;
    }

    function ownerOf(uint256 tokenId) external view returns (address) {
        return buildingToOwner[tokenId];
    }
}