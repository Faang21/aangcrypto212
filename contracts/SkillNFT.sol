// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

/**
 * @title SkillNFT
 * @dev ERC721 NFT contract for in-game skills.
 * Skills can be granted to players (minted by owner/game server)
 * or acquired through gameplay. Each skill token carries metadata
 * describing its attributes.
 */
contract SkillNFT is ERC721URIStorage, Ownable {
    using Counters for Counters.Counter;

    Counters.Counter private _tokenIds;

    struct SkillType {
        string name;
        uint8 level;      // 1-10
        uint256 mintPrice; // 0 = not for sale, >0 = purchasable
        bool active;
    }

    // skillTypeId => SkillType
    mapping(uint256 => SkillType) public skillTypes;
    uint256 public skillTypeCount;

    // tokenId => skillTypeId
    mapping(uint256 => uint256) public tokenSkillType;

    // wallet => skillTypeId => tokenId (prevent duplicate skills per wallet)
    mapping(address => mapping(uint256 => uint256)) public walletSkill;
    mapping(address => mapping(uint256 => bool)) public hasSkill;

    event SkillTypeAdded(uint256 indexed typeId, string name, uint8 level, uint256 mintPrice);
    event SkillMinted(address indexed to, uint256 indexed tokenId, uint256 indexed skillTypeId);

    constructor() ERC721("PixelGameSkill", "SKILL") Ownable() {}

    // ── Admin functions ──────────────────────────────────────────────────────

    function addSkillType(
        string memory name,
        uint8 level,
        uint256 mintPrice
    ) external onlyOwner {
        require(level >= 1 && level <= 10, "Level must be 1-10");
        uint256 typeId = skillTypeCount++;
        skillTypes[typeId] = SkillType(name, level, mintPrice, true);
        emit SkillTypeAdded(typeId, name, level, mintPrice);
    }

    /**
     * @dev Grant a skill NFT to a player (used by game server / owner).
     */
    function grantSkill(address player, uint256 skillTypeId, string memory tokenURI) external onlyOwner {
        _mintSkill(player, skillTypeId, tokenURI);
    }

    // ── Player functions ─────────────────────────────────────────────────────

    /**
     * @dev Purchase a skill NFT (if the skill type has a mint price).
     */
    function purchaseSkill(uint256 skillTypeId, string memory tokenURI) external payable {
        SkillType storage st = skillTypes[skillTypeId];
        require(st.active, "Skill type not active");
        require(st.mintPrice > 0, "Skill not for sale");
        require(msg.value == st.mintPrice, "Incorrect payment");
        require(!hasSkill[msg.sender][skillTypeId], "Already owned");
        _mintSkill(msg.sender, skillTypeId, tokenURI);
    }

    // ── Internal ─────────────────────────────────────────────────────────────

    function _mintSkill(address to, uint256 skillTypeId, string memory tokenURI) internal {
        require(bytes(skillTypes[skillTypeId].name).length > 0, "Skill type does not exist");
        require(!hasSkill[to][skillTypeId], "Already has this skill");

        uint256 newTokenId = _tokenIds.current();
        _tokenIds.increment();
        _safeMint(to, newTokenId);
        _setTokenURI(newTokenId, tokenURI);
        tokenSkillType[newTokenId] = skillTypeId;
        walletSkill[to][skillTypeId] = newTokenId;
        hasSkill[to][skillTypeId] = true;

        emit SkillMinted(to, newTokenId, skillTypeId);
    }

    function totalMinted() external view returns (uint256) {
        return _tokenIds.current();
    }

    // Collect ETH from skill purchases
    function withdraw() external onlyOwner {
        (bool sent, ) = owner().call{value: address(this).balance}("");
        require(sent, "Transfer failed");
    }

    receive() external payable {}
}
