// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

/**
 * @title HouseNFT
 * @dev ERC721 NFT contract for in-game houses.
 * Houses can be minted, listed on the marketplace, bought and sold.
 * Buy price is always higher than sell (buyback) price.
 */
contract HouseNFT is ERC721URIStorage, Ownable {
    using Counters for Counters.Counter;

    Counters.Counter private _tokenIds;

    // House type definitions
    struct HouseType {
        string name;
        uint256 buyPrice;   // price to buy from marketplace (ETH wei)
        uint256 sellPrice;  // buyback price when selling back (ETH wei, always < buyPrice)
        uint256 maxSupply;
        uint256 minted;
    }

    // User listing on secondary market
    struct Listing {
        address seller;
        uint256 price;
        bool active;
    }

    // houseTypeId => HouseType
    mapping(uint256 => HouseType) public houseTypes;
    uint256 public houseTypeCount;

    // tokenId => houseTypeId
    mapping(uint256 => uint256) public tokenHouseType;

    // tokenId => Listing
    mapping(uint256 => Listing) public listings;

    // Contract treasury (accumulated from sales minus buybacks)
    uint256 public treasury;

    event HouseTypeAdded(uint256 indexed typeId, string name, uint256 buyPrice, uint256 sellPrice);
    event HouseMinted(address indexed to, uint256 indexed tokenId, uint256 indexed houseTypeId);
    event HouseListed(uint256 indexed tokenId, address indexed seller, uint256 price);
    event HouseDelisted(uint256 indexed tokenId);
    event HouseSold(uint256 indexed tokenId, address indexed from, address indexed to, uint256 price);
    event HouseSoldBack(uint256 indexed tokenId, address indexed seller, uint256 price);

    constructor() ERC721("PixelGameHouse", "HOUSE") Ownable() {}

    // ── Admin functions ──────────────────────────────────────────────────────

    /**
     * @dev Add a new house type to the marketplace.
     * @param name        Display name of the house type
     * @param buyPrice    Price players pay to buy from the marketplace (wei)
     * @param sellPrice   Buyback price when players sell back (wei, must be < buyPrice)
     * @param maxSupply   Maximum number of this house type (0 = unlimited)
     * @param baseURI     Metadata URI for this house type
     */
    function addHouseType(
        string memory name,
        uint256 buyPrice,
        uint256 sellPrice,
        uint256 maxSupply,
        string memory baseURI
    ) external onlyOwner {
        require(buyPrice > 0, "Buy price must be > 0");
        require(sellPrice < buyPrice, "Sell price must be less than buy price");

        uint256 typeId = houseTypeCount++;
        houseTypes[typeId] = HouseType(name, buyPrice, sellPrice, maxSupply, 0);

        emit HouseTypeAdded(typeId, name, buyPrice, sellPrice);
    }

    // ── Player functions ─────────────────────────────────────────────────────

    /**
     * @dev Buy a house directly from the marketplace.
     */
    function buyFromMarket(uint256 houseTypeId, string memory tokenURI) external payable {
        HouseType storage ht = houseTypes[houseTypeId];
        require(bytes(ht.name).length > 0, "House type does not exist");
        require(msg.value == ht.buyPrice, "Incorrect payment");
        require(ht.maxSupply == 0 || ht.minted < ht.maxSupply, "Sold out");

        ht.minted++;
        treasury += msg.value;

        uint256 newTokenId = _tokenIds.current();
        _tokenIds.increment();
        _safeMint(msg.sender, newTokenId);
        _setTokenURI(newTokenId, tokenURI);
        tokenHouseType[newTokenId] = houseTypeId;

        emit HouseMinted(msg.sender, newTokenId, houseTypeId);
    }

    /**
     * @dev Sell a house back to the marketplace (at the lower buyback price).
     */
    function sellToMarket(uint256 tokenId) external {
        require(ownerOf(tokenId) == msg.sender, "Not the owner");
        // Remove any active listing first
        if (listings[tokenId].active) {
            listings[tokenId].active = false;
        }

        uint256 houseTypeId = tokenHouseType[tokenId];
        uint256 payout = houseTypes[houseTypeId].sellPrice;
        require(treasury >= payout, "Insufficient treasury");

        treasury -= payout;
        _burn(tokenId);

        (bool sent, ) = msg.sender.call{value: payout}("");
        require(sent, "Transfer failed");

        emit HouseSoldBack(tokenId, msg.sender, payout);
    }

    /**
     * @dev List a house on the player-to-player secondary market.
     */
    function listHouse(uint256 tokenId, uint256 price) external {
        require(ownerOf(tokenId) == msg.sender, "Not the owner");
        require(price > 0, "Price must be > 0");
        approve(address(this), tokenId);
        listings[tokenId] = Listing(msg.sender, price, true);
        emit HouseListed(tokenId, msg.sender, price);
    }

    /**
     * @dev Cancel a secondary-market listing.
     */
    function delistHouse(uint256 tokenId) external {
        require(listings[tokenId].seller == msg.sender, "Not the seller");
        listings[tokenId].active = false;
        emit HouseDelisted(tokenId);
    }

    /**
     * @dev Buy a house from another player's listing.
     */
    function buyFromPlayer(uint256 tokenId) external payable {
        Listing storage listing = listings[tokenId];
        require(listing.active, "Not listed");
        require(msg.value == listing.price, "Incorrect payment");

        address seller = listing.seller;
        listing.active = false;

        // Transfer NFT
        _transfer(seller, msg.sender, tokenId);

        // Pay seller
        (bool sent, ) = seller.call{value: msg.value}("");
        require(sent, "Transfer failed");

        emit HouseSold(tokenId, seller, msg.sender, msg.value);
    }

    // ── View helpers ─────────────────────────────────────────────────────────

    function totalMinted() external view returns (uint256) {
        return _tokenIds.current();
    }

    // Allow contract to receive ETH (treasury top-up by owner)
    receive() external payable {
        treasury += msg.value;
    }

    function withdrawTreasury(uint256 amount) external onlyOwner {
        require(amount <= treasury, "Exceeds treasury");
        treasury -= amount;
        (bool sent, ) = owner().call{value: amount}("");
        require(sent, "Transfer failed");
    }
}
