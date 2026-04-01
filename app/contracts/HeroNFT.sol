// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract HeroNFT is ERC721, Ownable {
    enum Rarity { Common, Rare, Epic, Legendary }
    enum ModuleType { Blade, Armor, Reactor, Stabilizer, LuckCrystal }

    struct Stats {
        uint16 atk;
        uint16 def_;
        uint16 hp;
        uint16 agi;
        uint16 lck;
    }

    struct Progress {
        uint16 level;
        uint32 xp;
        uint8 upgradesThisLevel;
    }

    struct HeroData {
        Rarity rarity;
        Stats base;
        Stats bonus;
        Progress prog;
    }

    uint256 public nextId = 1;

    mapping(uint256 => HeroData) internal _hero;
    mapping(address => uint256[]) private _heroIdsByOwner;
    mapping(address => bool) public isBattler;
    mapping(address => bool) public isMinter;

    event HeroMinted(address indexed to, uint256 indexed tokenId, Rarity rarity);
    event XPGained(uint256 indexed tokenId, uint32 amount, uint32 newTotal);
    event LevelUp(uint256 indexed tokenId, uint16 newLevel);
    event ModulesReset(uint256 indexed tokenId, uint16 level);
    event ModuleApplied(uint256 indexed tokenId, ModuleType moduleType, uint16 valueAdded);
    event TournamentEntered(uint256 indexed tokenId, bytes32 indexed tournamentId);
    event MinterSet(address indexed minter, bool allowed);

    error NotBattler();
    error NotOwnerOfToken();
    error InvalidToken();
    error RequirementsNotMet();
    error UpgradeLimitReached();
    error NotMinter();

    constructor(address owner_) ERC721("Game Hero", "HERO") Ownable(owner_) {}

    function heroIdsOf(address owner) external view returns (uint256[] memory) {
        return _heroIdsByOwner[owner];
    }

    function heroCountOf(address owner) external view returns (uint256) {
        return _heroIdsByOwner[owner].length;
    }

    function setBattler(address battler, bool allowed) external onlyOwner {
        isBattler[battler] = allowed;
    }

    function setMinter(address minter, bool allowed) external onlyOwner {
        isMinter[minter] = allowed;
        emit MinterSet(minter, allowed);
    }

    function hero(uint256 tokenId) external view returns (HeroData memory) {
        if (_ownerOf(tokenId) == address(0)) revert InvalidToken();
        return _hero[tokenId];
    }

    function totalStats(uint256 tokenId) public view returns (Stats memory s) {
        if (_ownerOf(tokenId) == address(0)) revert InvalidToken();
        HeroData storage h = _hero[tokenId];
        s.atk = h.base.atk + h.bonus.atk;
        s.def_ = h.base.def_ + h.bonus.def_;
        s.hp = h.base.hp + h.bonus.hp;
        s.agi = h.base.agi + h.bonus.agi;
        s.lck = h.base.lck + h.bonus.lck;
    }

    function mintHero(address to, Rarity rarity, Stats calldata baseStats) external returns (uint256 tokenId) {
        if (msg.sender != owner() && !isMinter[msg.sender]) revert NotMinter();

        tokenId = nextId++;
        _safeMint(to, tokenId);
        _heroIdsByOwner[to].push(tokenId);

        _hero[tokenId].rarity = rarity;
        _hero[tokenId].base = baseStats;
        _hero[tokenId].prog = Progress({level: 1, xp: 0, upgradesThisLevel: 0});

        emit HeroMinted(to, tokenId, rarity);
    }

    function grantXp(uint256 tokenId, uint32 amount) external {
        if (!isBattler[msg.sender]) revert NotBattler();
        if (_ownerOf(tokenId) == address(0)) revert InvalidToken();

        HeroData storage h = _hero[tokenId];
        h.prog.xp += amount;
        emit XPGained(tokenId, amount, h.prog.xp);

        while (h.prog.xp >= _xpForNextLevel(h.prog.level)) {
            h.prog.xp -= _xpForNextLevel(h.prog.level);
            h.prog.level += 1;
            h.prog.upgradesThisLevel = 0;
            delete h.bonus;
            emit ModulesReset(tokenId, h.prog.level);
            emit LevelUp(tokenId, h.prog.level);
        }
    }

    function enterTournament(uint256 tokenId, bytes32 tournamentId) external {
        if (_ownerOf(tokenId) == address(0)) revert InvalidToken();
        if (ownerOf(tokenId) != msg.sender) revert NotOwnerOfToken();
        emit TournamentEntered(tokenId, tournamentId);
    }

    function applyModule(uint256 tokenId, ModuleType m) external {
        if (_ownerOf(tokenId) == address(0)) revert InvalidToken();
        if (ownerOf(tokenId) != msg.sender) revert NotOwnerOfToken();

        HeroData storage h = _hero[tokenId];
        uint16 lvl = h.prog.level;
        uint16 req = _requiredLevel(m);
        if (lvl < req) revert RequirementsNotMet();

        uint8 limit = uint8(2 + lvl);
        if (h.prog.upgradesThisLevel >= limit) revert UpgradeLimitReached();

        uint16 delta = _moduleValue(m, h.rarity);
        if (m == ModuleType.Blade) h.bonus.atk += delta;
        else if (m == ModuleType.Armor) h.bonus.def_ += delta;
        else if (m == ModuleType.Reactor) h.bonus.hp += delta;
        else if (m == ModuleType.Stabilizer) h.bonus.agi += delta;
        else if (m == ModuleType.LuckCrystal) h.bonus.lck += delta;

        h.prog.upgradesThisLevel += 1;
        emit ModuleApplied(tokenId, m, delta);
    }

    function _xpForNextLevel(uint16 level) internal pure returns (uint32) {
        uint32 l = uint32(level);
        return 100 * l * l;
    }

    function _requiredLevel(ModuleType m) internal pure returns (uint16) {
        if (m == ModuleType.Blade) return 1;
        if (m == ModuleType.Armor) return 2;
        if (m == ModuleType.Reactor) return 3;
        if (m == ModuleType.Stabilizer) return 4;
        return 5;
    }

    function _moduleValue(ModuleType, Rarity r) internal pure returns (uint16) {
        if (r == Rarity.Common) return 2;
        if (r == Rarity.Rare) return 4;
        if (r == Rarity.Epic) return 7;
        return 10;
    }
}
