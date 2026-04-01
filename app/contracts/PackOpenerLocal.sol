// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {InGameCurrency} from "./InGameCurrency.sol";
import {HeroNFT} from "./HeroNFT.sol";

contract PackOpenerLocal {
    InGameCurrency public immutable currency;
    HeroNFT public immutable heroes;

    uint256 public packPrice;

    event PackBought(address indexed user, uint256 price);
    event PackResolved(address indexed user, uint256 heroTokenId, HeroNFT.Rarity rarity);

    error PackPriceZero();

    constructor(
        InGameCurrency currency_,
        HeroNFT heroes_,
        uint256 packPrice_
    ) {
        if (packPrice_ == 0) revert PackPriceZero();
        currency = currency_;
        heroes = heroes_;
        packPrice = packPrice_;
    }

    function setPackPrice(uint256 newPrice) external {
        if (newPrice == 0) revert PackPriceZero();
        packPrice = newPrice;
    }

    function buyPack() external returns (uint256 heroId) {
        currency.spendFrom(msg.sender, packPrice);
        emit PackBought(msg.sender, packPrice);

        // On Hardhat block.prevrandao is always 0 — add gasleft() + tx.gasprice for entropy
        uint256 randomWord = uint256(
            keccak256(
                abi.encode(
                    block.prevrandao,
                    block.timestamp,
                    block.number,
                    gasleft(),
                    tx.gasprice,
                    msg.sender,
                    heroes.nextId()
                )
            )
        );

        HeroNFT.Rarity rarity = _rollRarity(uint256(keccak256(abi.encode(randomWord, msg.sender, "R"))));
        HeroNFT.Stats memory stats = _rollHeroStats(uint256(keccak256(abi.encode(randomWord, msg.sender, "S"))), rarity);

        heroId = heroes.mintHero(msg.sender, rarity, stats);
        emit PackResolved(msg.sender, heroId, rarity);
    }

    function _rollRarity(uint256 word) internal pure returns (HeroNFT.Rarity) {
        uint256 x = word % 100;
        // Local test probabilities: 40% Common, 30% Rare, 20% Epic, 10% Legendary
        if (x < 40) return HeroNFT.Rarity.Common;
        if (x < 70) return HeroNFT.Rarity.Rare;
        if (x < 90) return HeroNFT.Rarity.Epic;
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
