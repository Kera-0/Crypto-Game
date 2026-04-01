// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {HeroNFT} from "./HeroNFT.sol";
import {CityFiled} from "./city.sol";

contract PvPBattles {
    uint256 public constant SECONDS_PER_DISTANCE = 1;
    uint256 constant MAX_ROUNDS = 1000;
    HeroNFT public immutable heroes;
    CityFiled public immutable city;

    mapping(address => uint256) public attackerLockedUntil;
    mapping(address => uint256) public tournamentWins;

    struct BattleRecord {
        uint64 timestamp;
        address attacker;
        address defender;
        address winner;
        address loser;
        uint256 rounds;
    }

    uint256 public nextBattleId = 1;
    mapping(uint256 => BattleRecord) public battles;
    mapping(address => uint256[]) private _battleIdsByPlayer;

    event Attacked(
        uint256 indexed battleId,
        address indexed attacker,
        address indexed defender,
        uint256 travelTimeSeconds
    );
    event BattleFinished(
        uint256 indexed battleId,
        address indexed winner,
        address indexed loser,
        uint256 rounds
    );

    error AttackerLocked(uint256 untilTs);
    error SamePlayer();
    error MissingCity();

    constructor(HeroNFT heroes_, CityFiled city_) {
        heroes = heroes_;
        city = city_;
    }

    function playerBattleIds(
        address player
    ) external view returns (uint256[] memory) {
        return _battleIdsByPlayer[player];
    }

    function playerBattleCount(address player) external view returns (uint256) {
        return _battleIdsByPlayer[player].length;
    }

    function travelTimeSeconds(address a, address b) external view returns (uint256) {
        return _travelTime(a, b);
    }

    function attack(address defender) external returns (uint256 battleId) {
        if (defender == msg.sender) revert SamePlayer();

        uint256 untilTs = attackerLockedUntil[msg.sender];
        if (block.timestamp < untilTs) revert AttackerLocked(untilTs);

        if (city.ownerToCity(msg.sender) == 0) revert MissingCity();
        if (city.ownerToCity(defender) == 0) revert MissingCity();

        uint256 travel = _travelTime(msg.sender, defender);
        attackerLockedUntil[msg.sender] = block.timestamp + travel;

        (address winner, address loser, uint256 rounds) = _fight(msg.sender, defender);
        city.loseMoney(winner, loser);

        tournamentWins[winner]++;

        battleId = nextBattleId++;

        battles[battleId] = BattleRecord({
            timestamp: uint64(block.timestamp),
            attacker: msg.sender,
            defender: defender,
            winner: winner,
            loser: loser,
            rounds: rounds
        });

        _battleIdsByPlayer[msg.sender].push(battleId);
        _battleIdsByPlayer[defender].push(battleId);

        emit Attacked(battleId, msg.sender, defender, travel);
        emit BattleFinished(battleId, winner, loser, rounds);
    }

    function _travelTime(address a, address b) internal view returns (uint256) {
        (uint32 ax, uint32 ay) = city.getCityCoord(a);
        (uint32 bx, uint32 by) = city.getCityCoord(b);

        uint256 dx = ax >= bx ? uint256(ax - bx) : uint256(bx - ax);
        uint256 dy = ay >= by ? uint256(ay - by) : uint256(by - ay);
        uint256 dist = dx + dy;
        return dist * SECONDS_PER_DISTANCE;
    }

    struct SumStats {
        uint256 atk;
        uint256 def_;
        uint256 hp;
        uint256 agi;
        uint256 lck;
    }

    function _fight(
        address attacker,
        address defender
    ) internal view returns (address winner, address loser, uint256 rounds) {
        SumStats memory a = _summirize(attacker);
        SumStats memory d = _summirize(defender);

        bool attackerTurn = a.agi >= d.agi;

        while (a.hp > 0 && d.hp > 0 && rounds < MAX_ROUNDS) {
            rounds++;
            uint256 salt = uint256(
                keccak256(abi.encodePacked(attacker, defender, rounds, attackerTurn))
            );
            if (attackerTurn) {
                d.hp -= _hit(a, d, salt, attacker, defender);
            } else {
                a.hp -= _hit(d, a, salt, defender, attacker);
            }
            attackerTurn = !attackerTurn;
        }

        if (a.hp > d.hp) {
            return (attacker, defender, rounds);
        }
        if (d.hp > a.hp) {
            return (defender, attacker, rounds);
        }
        if (a.agi >= d.agi) return (attacker, defender, rounds);
        return (defender, attacker, rounds);
    }

    function _summirize(
        address player
    ) internal view returns (SumStats memory s) {
        uint256[] memory ids = heroes.heroIdsOf(player);
        for (uint256 i = 0; i < ids.length; i++) {
            HeroNFT.Stats memory hs = heroes.totalStats(ids[i]);
            s.atk += uint256(hs.atk);
            s.def_ += uint256(hs.def_);
            s.hp += uint256(hs.hp);
            s.agi += uint256(hs.agi);
            s.lck += uint256(hs.lck);
        }

        (, uint256 power, uint256 defense) = city.getCityStats(player);
        s.atk += power;
        s.def_ += defense;
    }

    function _hit(
        SumStats memory a,
        SumStats memory b,
        uint256 salt,
        address attacker,
        address defender
    ) internal view returns (uint256) {
        uint256 randomWord = uint256(
            keccak256(abi.encodePacked(block.prevrandao, block.timestamp, block.number, msg.sender, salt))
        );

        uint256 atk = a.atk;
        uint256 def_ = b.def_;

        if (a.lck >= (uint256(keccak256(abi.encode(randomWord, "A"))) % 100) * heroes.heroIdsOf(attacker).length) {
            atk *= 2;
        }
        if (b.lck >= (uint256(keccak256(abi.encode(randomWord, "D"))) % 100) * heroes.heroIdsOf(defender).length) {
            def_ *= 2;
        }

        if (atk <= def_) {
            return 0;
        } else {
            if ((atk - def_) >= b.hp) {
                return b.hp;
            } else {
                return atk - def_;
            }
        }
    }
}
