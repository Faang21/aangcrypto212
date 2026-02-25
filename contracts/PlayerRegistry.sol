// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title PlayerRegistry
 * @dev Maps wallet addresses to in-game pixel nicknames.
 * The wallet is always the source of truth; the nickname is display-only.
 */
contract PlayerRegistry {
    // wallet => nickname
    mapping(address => string) private _nicknames;

    // nickname (lowercased) => wallet (for uniqueness check)
    mapping(string => address) private _nicknameOwner;

    uint256 public constant MAX_NICKNAME_LEN = 24;

    event NicknameSet(address indexed wallet, string nickname);

    /**
     * @dev Set or update the caller's nickname.
     * Nicknames must be unique (case-insensitive) and 1-24 characters long.
     */
    function setNickname(string memory nickname) external {
        bytes memory nb = bytes(nickname);
        require(nb.length > 0 && nb.length <= MAX_NICKNAME_LEN, "Nickname length invalid");

        // Validate: only alphanumeric and underscore
        for (uint256 i = 0; i < nb.length; i++) {
            bytes1 c = nb[i];
            require(
                (c >= 0x30 && c <= 0x39) || // 0-9
                (c >= 0x41 && c <= 0x5A) || // A-Z
                (c >= 0x61 && c <= 0x7A) || // a-z
                c == 0x5F,                  // _
                "Invalid character: only letters, digits and _ allowed"
            );
        }

        string memory lower = _toLower(nickname);

        // Release old nickname if any
        string memory oldNickname = _nicknames[msg.sender];
        if (bytes(oldNickname).length > 0) {
            string memory oldLower = _toLower(oldNickname);
            delete _nicknameOwner[oldLower];
        }

        // Check uniqueness
        require(_nicknameOwner[lower] == address(0), "Nickname already taken");

        _nicknames[msg.sender] = nickname;
        _nicknameOwner[lower] = msg.sender;

        emit NicknameSet(msg.sender, nickname);
    }

    function getNickname(address wallet) external view returns (string memory) {
        return _nicknames[wallet];
    }

    function getWalletByNickname(string memory nickname) external view returns (address) {
        return _nicknameOwner[_toLower(nickname)];
    }

    function hasNickname(address wallet) external view returns (bool) {
        return bytes(_nicknames[wallet]).length > 0;
    }

    // ── Internal ─────────────────────────────────────────────────────────────

    function _toLower(string memory str) internal pure returns (string memory) {
        bytes memory bStr = bytes(str);
        bytes memory bLower = new bytes(bStr.length);
        for (uint256 i = 0; i < bStr.length; i++) {
            if (bStr[i] >= 0x41 && bStr[i] <= 0x5A) {
                bLower[i] = bytes1(uint8(bStr[i]) + 32);
            } else {
                bLower[i] = bStr[i];
            }
        }
        return string(bLower);
    }
}
