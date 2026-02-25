// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

/**
 * @title LearningNFT
 * @dev ERC721 NFT contract for in-game learning certificates / courses.
 * When a player completes a learning module they receive a non-transferable
 * (soulbound) certificate NFT.  Transferability can be enabled by the owner
 * to allow a future marketplace.
 */
contract LearningNFT is ERC721URIStorage, Ownable {
    using Counters for Counters.Counter;

    Counters.Counter private _tokenIds;

    struct Course {
        string name;
        string description;
        uint256 mintPrice; // 0 = free (granted), >0 = purchasable
        bool active;
        bool soulbound;    // if true, transfers are blocked
    }

    // courseId => Course
    mapping(uint256 => Course) public courses;
    uint256 public courseCount;

    // tokenId => courseId
    mapping(uint256 => uint256) public tokenCourse;

    // wallet => courseId => completed
    mapping(address => mapping(uint256 => bool)) public completed;

    event CourseAdded(uint256 indexed courseId, string name, bool soulbound, uint256 mintPrice);
    event CertificateMinted(address indexed to, uint256 indexed tokenId, uint256 indexed courseId);

    constructor() ERC721("PixelGameLearning", "LEARN") Ownable() {}

    // ── Admin functions ──────────────────────────────────────────────────────

    function addCourse(
        string memory name,
        string memory description,
        uint256 mintPrice,
        bool soulbound
    ) external onlyOwner {
        uint256 courseId = courseCount++;
        courses[courseId] = Course(name, description, mintPrice, true, soulbound);
        emit CourseAdded(courseId, name, soulbound, mintPrice);
    }

    /**
     * @dev Mark a course complete and issue a certificate (called by game server / owner).
     */
    function completeCourse(address player, uint256 courseId, string memory tokenURI) external onlyOwner {
        _issueCertificate(player, courseId, tokenURI);
    }

    // ── Player functions ─────────────────────────────────────────────────────

    /**
     * @dev Enroll and receive a certificate by paying the course fee.
     */
    function enrollCourse(uint256 courseId, string memory tokenURI) external payable {
        Course storage c = courses[courseId];
        require(c.active, "Course not active");
        require(c.mintPrice > 0, "Course not for direct purchase");
        require(msg.value == c.mintPrice, "Incorrect payment");
        _issueCertificate(msg.sender, courseId, tokenURI);
    }

    // ── Internal ─────────────────────────────────────────────────────────────

    function _issueCertificate(address to, uint256 courseId, string memory tokenURI) internal {
        require(bytes(courses[courseId].name).length > 0, "Course does not exist");
        require(!completed[to][courseId], "Already completed");

        completed[to][courseId] = true;

        uint256 newTokenId = _tokenIds.current();
        _tokenIds.increment();
        _safeMint(to, newTokenId);
        _setTokenURI(newTokenId, tokenURI);
        tokenCourse[newTokenId] = courseId;

        emit CertificateMinted(to, newTokenId, courseId);
    }

    /**
     * @dev Override transfer to enforce soulbound restriction.
     */
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId,
        uint256 batchSize
    ) internal override {
        // Allow minting (from == address(0)) always
        if (from != address(0)) {
            uint256 courseId = tokenCourse[tokenId];
            require(!courses[courseId].soulbound, "This certificate is soulbound");
        }
        super._beforeTokenTransfer(from, to, tokenId, batchSize);
    }

    function totalMinted() external view returns (uint256) {
        return _tokenIds.current();
    }

    function withdraw() external onlyOwner {
        (bool sent, ) = owner().call{value: address(this).balance}("");
        require(sent, "Transfer failed");
    }

    receive() external payable {}
}
