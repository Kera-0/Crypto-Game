pragma solidity ^0.8.28;


import {BuildingItem} from "./buildingitem.sol";


contract BuildingFactory is BuildingItem {
    uint8 constant SHAPE_SHIFT = 5;
    uint8 constant LOOK_SHIFT = 14;
    uint64 constant LOOK_BITS_MASK = (uint64(1) << 50) - 1;
    uint32 constant COOLDOWN = 4 hours;    // TODO создать словарь для кажджого типа зданий с разным cooldown
    
    uint16 private constant VALID_COUNT = 174;
    bytes private constant VALID_MASKS_PACKED = hex"0007000b000f0013001600170019001a001b001e001f00260027002f0032003300340036003700380039003a003b003c003d003e003f0049004b004f00580059005a005b005e005f006f00780079007a007b007c007d007e009200930096009700980099009a009b009e009f00b000b200b300b400b600b700b800b900ba00bb00bc00bd00be00bf00c800c900cb00cf00d800d900da00db00de00df00e400e600e700ec00ed00ee00f000f100f200f300f400f600f700f800f900fa00fb00fc00fd00fe00ff012401260127012c012d012e013001310132013301340136013701380139013a013b013c013d013e016401660167016c016d016e01700171017201730174017601780179017a017c017e018f0192019301960197019a019b019e01b001b201b301b401b601b801b901ba01bc01c001c801c901cb01d001d201d301d601d801d901da01e001e401e601e801e901ec01f001f201f401f8";

    uint256[32] mintPrice;

    function setMintPrice(uint8 buildingType, uint256 price) external onlyOwner {
        require(buildingType <= 31);
        require(price > 0);
        mintPrice[buildingType] = price;
    }

    function generateNBuildings(uint32 n, uint8 buildingType) external onlyOwner {
        require(buildingType <= 31);
        require(n > 0);

        for (uint32 i = 0; i < n; i++) {
            uint256 rnd = uint256(keccak256(abi.encodePacked(blockhash(block.number - 1), block.timestamp, i)));

            uint16 shapeMask = _getValidShapeMask(rnd);
            uint64 look = uint64(rnd) & LOOK_BITS_MASK;

            uint64 dna = uint64(buildingType) | (uint64(shapeMask) << SHAPE_SHIFT) | (look << LOOK_SHIFT);
            buildings.push(Building(dna, 1, uint32(block.timestamp + COOLDOWN), false)); // Листинг на маркете или минт
            uint256 id = buildings.length - 1;

            _addBuildingToOwner(address(this), id);

            marketplace.list(id, mintPrice[buildingType]);
        }
    }

    function _getValidShapeMask(uint256 seed) internal pure returns (uint16) {
        uint256 i = (seed % VALID_COUNT) * 2;
        return (uint16(uint8(VALID_MASKS_PACKED[i])) << 8)
            | uint16(uint8(VALID_MASKS_PACKED[i + 1]));
    }

    receive() external payable {}

    function withdraw(address payable to) external onlyOwner {
        (bool ok, ) = to.call{value: address(this).balance}("");
        require(ok, "withdraw failed");
    }
}
