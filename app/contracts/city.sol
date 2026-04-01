pragma solidity ^0.8.28;

import {BuildingFactory} from "./buildingsfactory.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";


interface IGameToken {
    function mint(address to, uint256 amount) external;
    function burn(address from, uint256 amount) external;
    function gameTransfer(address to, uint256 amount) external returns (bool);
}

contract CityFiled is BuildingFactory, ReentrancyGuard {
    IGameToken public token;
    address public pvpBattles;
    uint256 public constant MAP_SIZE = 100;

    constructor(address tokenAddress) {
        token = IGameToken(tokenAddress);
        cities.push();
    }

    function setPvPBattles(address pvpBattles_) external onlyOwner() {
        pvpBattles = pvpBattles_;
    }

    struct City {
        uint8 level;       
        uint256[12][12][10] fields;
        uint256 power;
        uint32 x;
        uint32 y;
    }

    struct BuildingPosition {
        uint8 layer;
        uint8 top;
        uint8 left;
    }

    City[] public cities;

    mapping (uint256 => address) public cityToOwner;
    mapping (address => uint256) public ownerToCity; // can have only 1 city
    mapping(uint256 => BuildingPosition) public buildingPosition;

    uint256[32] levelUpPrice;

    event LevelUpgraded(address indexed addr, uint8 level);
    event CityCreated(address indexed owner, uint256 indexed cityId, uint32 x, uint32 y);
    event PowerGained(uint256 power);
    event FieldChanged();

    function createCity() external {
        require(ownerToCity[msg.sender] == 0, "City already exists");

        cities.push();
        uint256 id = cities.length - 1;

        cityToOwner[id] = msg.sender;
        ownerToCity[msg.sender] = id;

        (uint32 x, uint32 y) = _rollCityCoord(msg.sender, id);
        City storage c = cities[id];
        c.x = x;
        c.y = y;

        emit CityCreated(msg.sender, id, x, y);
    }

    function getCityCoord(address owner) external view returns (uint32 x, uint32 y) {
        uint256 cityId = ownerToCity[owner];
        require(cityId != 0, "No city");
        City storage c = cities[cityId];
        return (c.x, c.y);
    }

    function _rollCityCoord(address owner, uint256 cityId) internal view returns (uint32 x, uint32 y) {
        uint256 randomWord = uint256(
            keccak256(
                abi.encode(
                    block.prevrandao,
                    block.timestamp,
                    block.number,
                    owner,
                    cityId
                )
            )
        );

        x = uint32(uint256(keccak256(abi.encode(randomWord, owner, "X"))) % MAP_SIZE);
        y = uint32(uint256(keccak256(abi.encode(randomWord, owner, "Y"))) % MAP_SIZE);
    }

    function setLevelUpPrice(uint8 level, uint256 price) external onlyOwner() {
        require(level <= 31);
        require(price > 0);
        levelUpPrice[level] = price;
    }

    function getMoney() external {
        uint256[] storage ids = ownerToBuildingIds[msg.sender];
        uint256 payout = 0;
        uint256 time = block.timestamp;

        for (uint256 i = 0; i < ids.length; i++) {
            Building storage b = buildings[ids[i]];

            if (b.isActive && _getBuildingType(b.dna) == 0 && time >= b.updateReadyTime) {
                payout += 100 * b.level;
                b.updateReadyTime = uint256(time + 4 hours);
            }
        }

        if (payout > 0) {
            token.gameTransfer(msg.sender, payout);
        }
    }

    function putBuilding(uint8 layer, uint8 top, uint8 left, uint256 buildingId) external {
        require(buildingId != 0, "Invalid building id");
        require(buildingToOwner[buildingId] == msg.sender, "Not building owner");

        uint256 cityId = ownerToCity[msg.sender];
        require(cityId != 0, "No city");

        City storage city = cities[cityId];
        Building storage building = buildings[buildingId];

        require(!building.isActive, "Building already placed");

        _checkPlacement(city, building.dna, layer, top, left);
        _placeBuilding(city, buildingId, building.dna, layer, top, left);

        building.isActive = true;
        buildingPosition[buildingId] = BuildingPosition(layer, top, left);

        emit FieldChanged();
    }

    function moveBuilding(uint8 newLayer, uint8 newTop, uint8 newLeft, uint256 buildingId) external {
        require(buildingId != 0, "Invalid building id");
        require(buildingToOwner[buildingId] == msg.sender, "Not building owner");

        uint256 cityId = ownerToCity[msg.sender];
        require(cityId != 0, "No city");

        City storage city = cities[cityId];
        Building storage building = buildings[buildingId];

        require(building.isActive, "Building is not placed");

        BuildingPosition memory oldPos = buildingPosition[buildingId];

        _clearBuilding(city, buildingId, building.dna, oldPos.layer, oldPos.top, oldPos.left);
        _checkPlacement(city, building.dna, newLayer, newTop, newLeft);
        _placeBuilding(city, buildingId, building.dna, newLayer, newTop, newLeft);

        buildingPosition[buildingId] = BuildingPosition(newLayer, newTop, newLeft);
    }

    function removeBuilding(uint256 buildingId) external {
        require(buildingId != 0, "Invalid building id");
        require(buildingToOwner[buildingId] == msg.sender, "Not building owner");

        uint256 cityId = ownerToCity[msg.sender];
        require(cityId != 0, "No city");

        City storage city = cities[cityId];
        Building storage building = buildings[buildingId];

        require(building.isActive, "Building is not placed");

        BuildingPosition memory pos = buildingPosition[buildingId];

        _clearBuilding(city, buildingId, building.dna, pos.layer, pos.top, pos.left);

        building.isActive = false;
        delete buildingPosition[buildingId];

        emit FieldChanged();
    }

    function canPlaceBuilding(
        address owner,
        uint8 layer,
        uint8 top,
        uint8 left,
        uint256 buildingId
    ) external view returns (bool) {
        if (buildingId == 0) return false;
        if (buildingToOwner[buildingId] != owner) return false;

        uint256 cityId = ownerToCity[owner];
        if (cityId == 0) return false;

        City storage city = cities[cityId];
        Building storage building = buildings[buildingId];

        if (layer > city.level) return false;

        uint16 mask = _getBuildingShapeMask(building.dna);
        if (mask == 0) return false;

        for (uint8 r = 0; r < 3; r++) {
            for (uint8 c = 0; c < 3; c++) {
                if (_hasShapeBit(mask, r, c)) {
                    if (top + r >= city.fields[layer].length) {
                        return false;
                    }
                    if (left + c >= city.fields[layer][top + r].length) {
                        return false;
                    }
                    if (city.fields[layer][top + r][left + c] != 0) {
                        return false;
                    }
                }
            }
        }

        return true;
    }

    function _checkPlacement(
        City storage city,
        uint64 dna,
        uint8 layer,
        uint8 top,
        uint8 left
    ) internal view {
        require(layer <= city.level, "Invalid layer");

        uint16 mask = _getBuildingShapeMask(dna);
        require(mask != 0, "Empty building shape");

        for (uint8 r = 0; r < 3; r++) {
            for (uint8 c = 0; c < 3; c++) {
                if (_hasShapeBit(mask, r, c)) {
                    require(top + r < city.fields[layer].length, "Out of bounds");
                    require(left + c < city.fields[layer][top + r].length, "Out of bounds");
                    require(city.fields[layer][top + r][left + c] == 0, "Collision");
                }
            }
        }
    }

    function _placeBuilding(
        City storage city,
        uint256 buildingId,
        uint64 dna,
        uint8 layer,
        uint8 top,
        uint8 left
    ) internal {
        uint16 mask = _getBuildingShapeMask(dna);

        for (uint8 r = 0; r < 3; r++) {
            for (uint8 c = 0; c < 3; c++) {
                if (_hasShapeBit(mask, r, c)) {
                    city.fields[layer][top + r][left + c] = buildingId;
                }
            }
        }
    }

    function _clearBuilding(
        City storage city,
        uint256 buildingId,
        uint64 dna,
        uint8 layer,
        uint8 top,
        uint8 left
    ) internal {
        uint16 mask = _getBuildingShapeMask(dna);

        for (uint8 r = 0; r < 3; r++) {
            for (uint8 c = 0; c < 3; c++) {
                if (_hasShapeBit(mask, r, c)) {
                    if (city.fields[layer][top + r][left + c] == buildingId) {
                        city.fields[layer][top + r][left + c] = 0;
                    }
                }
            }
        }
    }

    function getPower() external {
        uint256[] storage ids = ownerToBuildingIds[msg.sender];
        uint256 power = 0;
        uint256 time = block.timestamp;

        for (uint256 i = 0; i < ids.length; i++) {
            Building storage b = buildings[ids[i]];

            if (b.isActive && _getBuildingType(b.dna) == 1 && time >= b.updateReadyTime) {
                power += 100 * b.level;
                b.updateReadyTime = uint256(time + 4 hours);
            }
        }

        if (power > 0) {
            City storage city = cities[ownerToCity[msg.sender]];
            city.power += power;
        }

        emit PowerGained(power);
    }

    function upgradeLevel() external payable nonReentrant {
        uint256 cityId = ownerToCity[msg.sender];
        City storage city = cities[cityId];

        require(city.level <= 10, "max level");
        require(msg.value == levelUpPrice[city.level], "wrong value");

        city.level += 1;
        emit LevelUpgraded(msg.sender, city.level);
    }

    function getCell(address owner, uint8 layer, uint8 i, uint8 j) external view returns (uint256) {
        uint256 cityId = ownerToCity[owner];
        require(cityId != 0, "No city");
        return cities[cityId].fields[layer][i][j];
    }

    function _getDef(address owner) internal view returns (uint256 d) {
        uint256[] storage ids = ownerToBuildingIds[owner];
        uint256 def_ = 0;

        for (uint256 i = 0; i < ids.length; i++) {
            Building storage b = buildings[ids[i]];

            if (b.isActive && _getBuildingType(b.dna) == 2) {
                def_ += 10 * b.level;
            }
        }
        return def_;
    }

    function getCityStats(address owner) external view returns (uint8 level, uint256 power, uint256 _def) {
        uint256 cityId = ownerToCity[owner];
        require(cityId != 0, "No city");
        City storage c = cities[cityId];
        uint256 def_ = _getDef(owner);
        return (c.level, c.power, def_);
    }

    function getUpgradeLevelPrice() external view returns (uint256) {
        uint256 cityId = ownerToCity[msg.sender];
        City memory city = cities[cityId];
        
        uint8 cityLevel = city.level;
        return levelUpPrice[cityLevel];
    }

    function getAllCityOwners() external view returns (address[] memory owners) {
        uint256 n = cities.length;
        if (n <= 1) return new address[](0);

        owners = new address[](n - 1);
        for (uint256 i = 1; i < n; i++) {
            owners[i - 1] = cityToOwner[i];
        }
    }

    function loseMoney(address winner, address loser) external {
        require(msg.sender == pvpBattles, "Only PvP battles");
        uint256[] storage ids = ownerToBuildingIds[loser];
        uint256 payout = 0;
        uint256 time = block.timestamp;

        for (uint256 i = 0; i < ids.length; i++) {
            Building storage b = buildings[ids[i]];

            if (b.isActive && _getBuildingType(b.dna) == 0 && time >= b.updateReadyTime) {
                payout += 100 * b.level;
                b.updateReadyTime = uint256(time + 4 hours);
            }
        }

        if (payout > 0) {
            token.gameTransfer(winner, payout);
        }
    }
}

