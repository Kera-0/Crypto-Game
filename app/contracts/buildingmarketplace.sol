pragma solidity ^0.8.28;

import {Ownable} from "./Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IBuildingItem {
    function ownerOf(uint256 tokenId) external view returns (address);
    function transferForMarketplace(address from, address to, uint256 tokenId) external;
    function mint(address to, uint64 dna) external returns (uint256);
}

contract BuildingMarketplace is Ownable, ReentrancyGuard {
    // ─────────────────────────────────────────────────────────
    //  Constants & immutables
    // ─────────────────────────────────────────────────────────

    uint256 public constant DAILY_STOCK    = 100;
    uint16  public constant MAX_TYPE       = 3;   // Mine, Barracks, Tower

    uint8  private constant SHAPE_SHIFT    = 5;
    uint8  private constant LOOK_SHIFT     = 14;
    uint64 private constant LOOK_BITS_MASK = (uint64(1) << 50) - 1;
    uint16 private constant VALID_COUNT    = 174;

    // same packed mask table as BuildingFactory
    bytes private constant VALID_MASKS_PACKED =
        hex"0007000b000f0013001600170019001a001b001e001f00260027002f0032003300340036003700380039003a003b003c003d003e003f0049004b004f00580059005a005b005e005f006f00780079007a007b007c007d007e009200930096009700980099009a009b009e009f00b000b200b300b400b600b700b800b900ba00bb00bc00bd00be00bf00c800c900cb00cf00d800d900da00db00de00df00e400e600e700ec00ed00ee00f000f100f200f300f400f600f700f800f900fa00fb00fc00fd00fe00ff012401260127012c012d012e013001310132013301340136013701380139013a013b013c013d013e016401660167016c016d016e01700171017201730174017601780179017a017c017e018f0192019301960197019a019b019e01b001b201b301b401b601b801b901ba01bc01c001c801c901cb01d001d201d301d601d801d901da01e001e401e601e801e901ec01f001f201f401f8";

    // ─────────────────────────────────────────────────────────
    //  Storage
    // ─────────────────────────────────────────────────────────

    IBuildingItem public buildingItem;
    uint16 public feeBps = 250;

    // ---- player listings ----
    struct Listing {
        address seller;
        uint256 price;
    }
    mapping(uint256 => Listing) public listings;
    uint256[]                   private _activeTokenIds;
    mapping(uint256 => uint256) private _activeIndexPlusOne;

    // ---- official daily stock ----
    uint256[32] public stockPrice; // price in wei per building type (0 = not for sale)
    // soldByDay[unixDay][buildingType] = count sold that day
    mapping(uint256 => mapping(uint8 => uint256)) public soldByDay;

    // ─────────────────────────────────────────────────────────
    //  Events
    // ─────────────────────────────────────────────────────────

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
    event StockPurchased(
        address indexed buyer,
        uint8   indexed buildingType,
        uint256 indexed tokenId,
        uint256 price
    );

    // ─────────────────────────────────────────────────────────
    //  Constructor
    // ─────────────────────────────────────────────────────────

    constructor() Ownable(msg.sender) {}

    // ─────────────────────────────────────────────────────────
    //  Owner configuration
    // ─────────────────────────────────────────────────────────

    function setBuildingItem(address b) external onlyOwner {
        buildingItem = IBuildingItem(b);
    }

    function setFee(uint16 newFeeBps) external onlyOwner {
        feeBps = newFeeBps;
    }

    /// @notice Set the official daily-stock price for a building type.
    ///         Set to 0 to disable official sales for that type.
    function setStockPrice(uint8 buildingType, uint256 price) external onlyOwner {
        require(buildingType < 32);
        stockPrice[buildingType] = price;
    }

    // ─────────────────────────────────────────────────────────
    //  View helpers
    // ─────────────────────────────────────────────────────────

    function getActiveListings() external view returns (
        uint256[] memory tokenIds,
        address[]  memory sellers,
        uint256[]  memory prices
    ) {
        uint256 len = _activeTokenIds.length;
        tokenIds = new uint256[](len);
        sellers  = new address[](len);
        prices   = new uint256[](len);
        for (uint256 i; i < len; ++i) {
            uint256 tid = _activeTokenIds[i];
            tokenIds[i] = tid;
            sellers[i]  = listings[tid].seller;
            prices[i]   = listings[tid].price;
        }
    }

    /// @notice Returns (remaining, price) for each implemented building type (0..MAX_TYPE-1).
    function getStockInfo() external view returns (
        uint256[] memory remaining,
        uint256[] memory prices
    ) {
        uint256 today = block.timestamp / 1 days;
        remaining = new uint256[](MAX_TYPE);
        prices    = new uint256[](MAX_TYPE);
        for (uint8 t; t < MAX_TYPE; ++t) {
            uint256 sold = soldByDay[today][t];
            remaining[t] = sold >= DAILY_STOCK ? 0 : DAILY_STOCK - sold;
            prices[t]    = stockPrice[t];
        }
    }

    // ─────────────────────────────────────────────────────────
    //  Player listings
    // ─────────────────────────────────────────────────────────

    function list(uint256 tokenId, uint256 price) external nonReentrant {
        require(price > 0, "price=0");
        require(listings[tokenId].seller == address(0), "already listed");
        require(buildingItem.ownerOf(tokenId) == msg.sender, "not owner");

        buildingItem.transferForMarketplace(msg.sender, address(this), tokenId);

        listings[tokenId] = Listing(msg.sender, price);
        _activeTokenIds.push(tokenId);
        _activeIndexPlusOne[tokenId] = _activeTokenIds.length; // length (1-indexed)

        emit Listed(msg.sender, tokenId, price);
    }

    function updatePrice(uint256 tokenId, uint256 newPrice) external {
        Listing storage L = listings[tokenId];
        require(L.seller == msg.sender, "not seller");
        require(newPrice > 0, "price=0");
        L.price = newPrice;
        emit PriceUpdated(msg.sender, tokenId, newPrice);
    }

    function cancel(uint256 tokenId) external nonReentrant {
        Listing memory L = listings[tokenId];
        require(L.seller == msg.sender, "not seller");

        _removeListing(tokenId);
        buildingItem.transferForMarketplace(address(this), msg.sender, tokenId);

        emit Canceled(msg.sender, tokenId);
    }

    function buy(uint256 tokenId) external payable nonReentrant {
        Listing memory L = listings[tokenId];
        require(L.seller != address(0), "not listed");
        require(msg.value == L.price, "wrong value");
        require(msg.sender != L.seller, "self buy");

        _removeListing(tokenId);
        buildingItem.transferForMarketplace(address(this), msg.sender, tokenId);

        uint256 feeAmount    = (L.price * feeBps) / 10000;
        uint256 sellerAmount = L.price - feeAmount;

        (bool ok, ) = payable(L.seller).call{value: sellerAmount}("");
        require(ok, "seller transfer failed");

        emit Purchased(msg.sender, L.seller, tokenId, L.price, feeAmount, sellerAmount);
    }

    // ─────────────────────────────────────────────────────────
    //  Official daily stock
    // ─────────────────────────────────────────────────────────

    /// @notice Buy one building of `buildingType` from the official daily stock.
    function buyFromStock(uint8 buildingType) external payable nonReentrant {
        require(buildingType < MAX_TYPE, "invalid type");
        uint256 price = stockPrice[buildingType];
        require(price > 0, "not for sale");
        require(msg.value == price, "wrong value");

        uint256 today = block.timestamp / 1 days;
        require(soldByDay[today][buildingType] < DAILY_STOCK, "sold out today");

        soldByDay[today][buildingType]++;

        uint64 dna = _generateDna(buildingType);
        uint256 tokenId = buildingItem.mint(msg.sender, dna);

        emit StockPurchased(msg.sender, buildingType, tokenId, price);
    }

    // ─────────────────────────────────────────────────────────
    //  Internal helpers
    // ─────────────────────────────────────────────────────────

    function _removeListing(uint256 tokenId) internal {
        uint256 idx = _activeIndexPlusOne[tokenId] - 1;
        uint256 last = _activeTokenIds[_activeTokenIds.length - 1];
        _activeTokenIds[idx] = last;
        _activeIndexPlusOne[last] = idx + 1;
        _activeTokenIds.pop();
        delete _activeIndexPlusOne[tokenId];
        delete listings[tokenId];
    }

    function _generateDna(uint8 buildingType) internal view returns (uint64) {
        uint256 rnd = uint256(
            keccak256(abi.encodePacked(blockhash(block.number - 1), block.timestamp, msg.sender))
        );
        uint16 shapeMask = _getValidShapeMask(rnd);
        uint64 look      = uint64(rnd) & LOOK_BITS_MASK;
        return uint64(buildingType) | (uint64(shapeMask) << SHAPE_SHIFT) | (look << LOOK_SHIFT);
    }

    function _getValidShapeMask(uint256 seed) internal pure returns (uint16) {
        uint256 i = (seed % VALID_COUNT) * 2;
        return (uint16(uint8(VALID_MASKS_PACKED[i])) << 8)
             | uint16(uint8(VALID_MASKS_PACKED[i + 1]));
    }

    // ─────────────────────────────────────────────────────────
    //  ETH management
    // ─────────────────────────────────────────────────────────

    receive() external payable {}

    function withdraw(address payable to) external onlyOwner {
        (bool ok, ) = to.call{value: address(this).balance}("");
        require(ok, "withdraw failed");
    }
}
