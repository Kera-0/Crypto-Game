// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {VRFRandom} from "./VRFRandom.sol";
import {InGameCurrency} from "./InGameCurrency.sol";
import {HeroNFT} from "./HeroNFT.sol";

contract PackOpener is VRFRandom {
    InGameCurrency public immutable currency;
    HeroNFT public immutable heroes;

    uint256 public packPrice;
    mapping(uint256 => address) internal _buyerOf;

    event PackBought(address indexed user, uint256 indexed requestId, uint256 price);
    event PackResolved(address indexed user, uint256 indexed requestId, uint256 heroTokenId, HeroNFT.Rarity rarity);

    error PackPriceZero();
    error UnknownRequest();

    constructor(
        address coordinator,
        uint256 subId,
        bytes32 keyHash,
        InGameCurrency currency_,
        HeroNFT heroes_,
        uint256 packPrice_
    ) VRFRandom(coordinator, subId, keyHash) {
        if (packPrice_ == 0) revert PackPriceZero();
        currency = currency_;
        heroes = heroes_;
        packPrice = packPrice_;
    }

    function setPackPrice(uint256 newPrice) external onlyOwner {
        if (newPrice == 0) revert PackPriceZero();
        packPrice = newPrice;
    }

    function buyPack() external returns (uint256 requestId) {
        currency.spendFrom(msg.sender, packPrice);
        requestId = _requestRandom();
        _buyerOf[requestId] = msg.sender;
        emit PackBought(msg.sender, requestId, packPrice);
    }

    function _onRandom(address user, uint256 requestId, uint256 randomWord) internal override {
        address buyer = _buyerOf[requestId];
        if (buyer == address(0)) buyer = user;
        if (buyer == address(0)) revert UnknownRequest();

        HeroNFT.Rarity rarity = _rollRarity(uint256(keccak256(abi.encode(randomWord, buyer, "R"))));
        HeroNFT.Stats memory stats = _rollHeroStats(uint256(keccak256(abi.encode(randomWord, buyer, "S"))), rarity);

        uint256 heroId = heroes.mintHero(buyer, rarity, stats);
        emit PackResolved(buyer, requestId, heroId, rarity);

        delete _buyerOf[requestId];
    }

    function _rollRarity(uint256 word) internal pure returns (HeroNFT.Rarity) {
        uint256 x = word % 100;
        if (x < 75) return HeroNFT.Rarity.Common;
        if (x < 95) return HeroNFT.Rarity.Rare;
        if (x < 99) return HeroNFT.Rarity.Epic;
        return HeroNFT.Rarity.Legendary;
    }

    function _rollHeroStats(uint256 word, HeroNFT.Rarity rarity) internal pure returns (HeroNFT.Stats memory s) {
        uint16 baseMin;
        uint16 baseMax;

        if (rarity == HeroNFT.Rarity.Common) {
            baseMin = 8;
            baseMax = 12;
        } else if (rarity == HeroNFT.Rarity.Rare) {
            baseMin = 11;
            baseMax = 16;
        } else if (rarity == HeroNFT.Rarity.Epic) {
            baseMin = 15;
            baseMax = 22;
        } else {
            baseMin = 20;
            baseMax = 30;
        }

        s.atk = _randRange(word, 0, baseMin, baseMax);
        s.def_ = _randRange(word, 1, baseMin, baseMax);
        s.hp = _randRange(word, 2, uint16(baseMin * 5), uint16(baseMax * 5));
        s.agi = _randRange(word, 3, baseMin, baseMax);
        s.lck = _randRange(word, 4, 1, uint16((baseMax - baseMin) + 5));
    }

    function _randRange(uint256 word, uint256 salt, uint16 minV, uint16 maxV) internal pure returns (uint16) {
        uint256 x = uint256(keccak256(abi.encode(word, salt)));
        uint16 span = maxV - minV + 1;
        return uint16(minV + (x % span));
    }
}
