// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {HeroNFT} from "./HeroNFT.sol";
import {InGameCurrency} from "./InGameCurrency.sol";

contract HeroMarketplace is Ownable, ReentrancyGuard {
    struct Listing {
        address seller;
        uint256 price;
    }

    struct ListingView {
        uint256 tokenId;
        address seller;
        uint256 price;
    }

    HeroNFT public immutable heroes;
    InGameCurrency public immutable currency;
    uint16 public feeBps = 250;

    mapping(uint256 => Listing) public listings;

    uint256[] private _activeTokenIds;
    mapping(uint256 => uint256) private _activeIndexPlusOne;

    event Listed(address indexed seller, uint256 indexed tokenId, uint256 price);
    event PriceUpdated(address indexed seller, uint256 indexed tokenId, uint256 price);
    event Canceled(address indexed seller, uint256 indexed tokenId);
    event Purchased(
        address indexed buyer,
        address indexed seller,
        uint256 indexed tokenId,
        uint256 price,
        uint256 feeAmount,
        uint256 sellerAmount
    );

    constructor(address owner_, HeroNFT heroes_, InGameCurrency currency_) Ownable(owner_) {
        heroes = heroes_;
        currency = currency_;
    }

    function setFee(uint16 newFeeBps) external onlyOwner {
        require(newFeeBps <= 1000, "fee too high");
        feeBps = newFeeBps;
    }

    function activeListingCount() external view returns (uint256) {
        return _activeTokenIds.length;
    }

    function getActiveListings() external view returns (ListingView[] memory items) {
        uint256 length = _activeTokenIds.length;
        items = new ListingView[](length);

        for (uint256 i = 0; i < length; i++) {
            uint256 tokenId = _activeTokenIds[i];
            Listing storage listing = listings[tokenId];
            items[i] = ListingView({
                tokenId: tokenId,
                seller: listing.seller,
                price: listing.price
            });
        }
    }

    function list(uint256 tokenId, uint256 price) external nonReentrant {
        require(price > 0, "price=0");
        require(listings[tokenId].seller == address(0), "already listed");
        require(heroes.ownerOf(tokenId) == msg.sender, "not owner");

        heroes.transferFrom(msg.sender, address(this), tokenId);
        listings[tokenId] = Listing({seller: msg.sender, price: price});
        _pushActive(tokenId);

        emit Listed(msg.sender, tokenId, price);
    }

    function updatePrice(uint256 tokenId, uint256 newPrice) external {
        Listing storage listing = listings[tokenId];
        require(listing.seller == msg.sender, "not seller");
        require(newPrice > 0, "price=0");

        listing.price = newPrice;
        emit PriceUpdated(msg.sender, tokenId, newPrice);
    }

    function cancel(uint256 tokenId) external nonReentrant {
        Listing memory listing = listings[tokenId];
        require(listing.seller == msg.sender, "not seller");

        delete listings[tokenId];
        _removeActive(tokenId);
        heroes.transferFrom(address(this), msg.sender, tokenId);

        emit Canceled(msg.sender, tokenId);
    }

    function buy(uint256 tokenId) external nonReentrant {
        Listing memory listing = listings[tokenId];
        require(listing.seller != address(0), "not listed");
        require(msg.sender != listing.seller, "self buy");

        delete listings[tokenId];
        _removeActive(tokenId);

        uint256 feeAmount = (listing.price * feeBps) / 10000;
        uint256 sellerAmount = listing.price - feeAmount;

        if (sellerAmount > 0) {
            currency.moveBySpender(msg.sender, listing.seller, sellerAmount);
        }

        if (feeAmount > 0) {
            currency.moveBySpender(msg.sender, owner(), feeAmount);
        }

        heroes.transferFrom(address(this), msg.sender, tokenId);

        emit Purchased(msg.sender, listing.seller, tokenId, listing.price, feeAmount, sellerAmount);
    }

    function _pushActive(uint256 tokenId) internal {
        _activeIndexPlusOne[tokenId] = _activeTokenIds.length + 1;
        _activeTokenIds.push(tokenId);
    }

    function _removeActive(uint256 tokenId) internal {
        uint256 indexPlusOne = _activeIndexPlusOne[tokenId];
        require(indexPlusOne != 0, "missing listing");

        uint256 index = indexPlusOne - 1;
        uint256 lastIndex = _activeTokenIds.length - 1;

        if (index != lastIndex) {
            uint256 movedTokenId = _activeTokenIds[lastIndex];
            _activeTokenIds[index] = movedTokenId;
            _activeIndexPlusOne[movedTokenId] = index + 1;
        }

        _activeTokenIds.pop();
        delete _activeIndexPlusOne[tokenId];
    }
}
