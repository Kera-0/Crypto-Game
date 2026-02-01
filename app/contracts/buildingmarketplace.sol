pragma solidity ^0.8.28;

import {Ownable} from "./Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";


interface IBuildingItem {
    function ownerOf(uint256 tokenId) external view returns (address);
    function transferForMarketplace(address from, address to, uint256 tokenId) external;
}

contract BuildingMarketplace is Ownable, ReentrancyGuard {
    constructor() Ownable(msg.sender) {}

    struct Listing {
        address seller;
        uint256 price;
    }

    mapping(uint256 => Listing) public listings;

    uint16 public feeBps = 250;

    IBuildingItem buildings;

    function setBuildings(address b) external onlyOwner {
        buildings = IBuildingItem(b);
    }

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

    function setFee(uint16 newFeeBps) external onlyOwner {
        feeBps = newFeeBps;
    }

    function list(uint256 tokenId, uint256 price) external nonReentrant {
        require(price > 0, "price=0");
        require(listings[tokenId].seller == address(0), "already listed");
        require(buildings.ownerOf(tokenId) == msg.sender, "not owner");

        buildings.transferForMarketplace(msg.sender, address(this), tokenId);

        listings[tokenId] = Listing({ seller: msg.sender, price: price });
        emit Listed(msg.sender, tokenId, price);
    }

    function updatePrice(uint256 tokenId, uint256 newPrice) external {
        Listing storage L = listings[tokenId];
        require(L.seller == msg.sender);
        require(newPrice > 0, "price=0");

        L.price = newPrice;
        emit PriceUpdated(msg.sender, tokenId, newPrice);
    }

    function cancel(uint256 tokenId) external nonReentrant {
        Listing memory L = listings[tokenId];
        require(L.seller == msg.sender);

        delete listings[tokenId];
        buildings.transferForMarketplace(address(this), msg.sender, tokenId);

        emit Canceled(msg.sender, tokenId);
    }

    function buy(uint256 tokenId) external payable nonReentrant {
        Listing memory L = listings[tokenId];
        require(L.seller != address(0), "not listed");
        require(msg.value == L.price, "wrong value");
        require(msg.sender != L.seller, "self buy");

        delete listings[tokenId];

        buildings.transferForMarketplace(address(this), msg.sender, tokenId);

        uint256 feeAmount = (L.price * feeBps) / 10000;
        uint256 sellerAmount = L.price - feeAmount;

        (bool ok, ) = payable(L.seller).call{value: sellerAmount}("");
        require(ok, "seller transfer failed");

        emit Purchased(msg.sender, L.seller, tokenId, L.price, feeAmount, sellerAmount);
    }

}