// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {PvPBattles} from "./PvPBattles.sol";
import {HeroNFT} from "./HeroNFT.sol";
import {CityFiled} from "./city.sol";
import {GameToken} from "./token.sol";
import {Ownable} from "./Ownable.sol";

contract PvPBattlesTournament is PvPBattles, Ownable {
    uint256 public tournamentPeriodSeconds;
    uint256 public tournamentReward;

    GameToken public immutable rewardToken;

    uint256 public tournamentRoundStartedAt;

    event TournamentRoundFinalized(
        address indexed winner,
        uint256 winnerWins,
        uint256 rewardAmount,
        uint256 newRoundStartedAt
    );

    error TournamentNotOver(uint256 availableAfter);

    constructor(
        HeroNFT heroes_,
        CityFiled city_,
        GameToken rewardToken_,
        address initialOwner
    ) PvPBattles(heroes_, city_) Ownable(initialOwner) {
        rewardToken = rewardToken_;
        tournamentPeriodSeconds = 60;
        tournamentReward = 10000000;
        tournamentRoundStartedAt = block.timestamp;
    }

    function setTournamentPeriodSeconds(uint256 value) external onlyOwner {
        tournamentPeriodSeconds = value;
    }

    function setTournamentReward(uint256 value) external onlyOwner {
        tournamentReward = value;
    }

    function finalizeTournament() external {
        uint256 deadline = tournamentRoundStartedAt + tournamentPeriodSeconds;
        if (block.timestamp < deadline) revert TournamentNotOver(deadline);
        _finalizeTournamentRound();
    }

    function _finalizeTournamentRound() private {
        address[] memory owners = city.getAllCityOwners();

        address best = address(0);
        uint256 bestWins = 0;

        for (uint256 i = 0; i < owners.length; i++) {
            address o = owners[i];
            uint256 w = tournamentWins[o];
            if (w > bestWins) {
                bestWins = w;
                best = o;
            }
        }

        if (bestWins > 0 && best != address(0)) {
            rewardToken.mintPvpReward(best, tournamentReward);
        }

        for (uint256 i = 0; i < owners.length; i++) {
            tournamentWins[owners[i]] = 0;
        }

        tournamentRoundStartedAt = block.timestamp;
        emit TournamentRoundFinalized(best, bestWins, bestWins > 0 ? tournamentReward : 0, block.timestamp);
    }
}
