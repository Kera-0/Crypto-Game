// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {VRFConsumerBaseV2Plus} from "@chainlink/contracts/src/v0.8/vrf/dev/VRFConsumerBaseV2Plus.sol";
import {VRFV2PlusClient} from "@chainlink/contracts/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";

abstract contract VRFRandom is VRFConsumerBaseV2Plus {
    uint256 internal immutable VRF_SUB_ID;
    bytes32 internal immutable VRF_KEYHASH;

    uint32 internal constant VRF_CALLBACK_GAS = 200_000;
    uint16 internal constant VRF_CONFIRMATIONS = 3;
    uint32 internal constant VRF_NUM_WORDS = 1;

    mapping(uint256 => address) internal _reqToUser;

    constructor(address coordinator, uint256 subId, bytes32 keyHash) VRFConsumerBaseV2Plus(coordinator) {
        VRF_SUB_ID = subId;
        VRF_KEYHASH = keyHash;
    }

    function _requestRandom() internal virtual returns (uint256 requestId) {
        requestId = s_vrfCoordinator.requestRandomWords(
            VRFV2PlusClient.RandomWordsRequest({
                keyHash: VRF_KEYHASH,
                subId: VRF_SUB_ID,
                requestConfirmations: VRF_CONFIRMATIONS,
                callbackGasLimit: VRF_CALLBACK_GAS,
                numWords: VRF_NUM_WORDS,
                extraArgs: VRFV2PlusClient._argsToBytes(VRFV2PlusClient.ExtraArgsV1({nativePayment: true}))
            })
        );
        _reqToUser[requestId] = msg.sender;
    }

    function fulfillRandomWords(uint256 requestId, uint256[] calldata randomWords) internal virtual override {
        address user = _reqToUser[requestId];
        delete _reqToUser[requestId];
        _onRandom(user, requestId, randomWords[0]);
    }

    function _onRandom(address user, uint256 requestId, uint256 randomWord) internal virtual;
}
