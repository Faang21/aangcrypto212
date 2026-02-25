// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title VendingMachine
 * @dev On-chain vending machine for in-game food items.
 * Each food purchase is recorded on-chain as a transaction.
 */
contract VendingMachine is Ownable {
    struct FoodItem {
        string name;
        uint256 price; // in wei
        uint256 stock; // 0 = unlimited
        bool active;
    }

    // foodId => FoodItem
    mapping(uint256 => FoodItem) public foodItems;
    uint256 public foodCount;

    // Purchase history: buyer => list of (foodId, timestamp)
    struct Purchase {
        uint256 foodId;
        uint256 quantity;
        uint256 timestamp;
    }
    mapping(address => Purchase[]) public purchaseHistory;

    uint256 public totalRevenue;

    event FoodAdded(uint256 indexed foodId, string name, uint256 price);
    event FoodPurchased(address indexed buyer, uint256 indexed foodId, uint256 quantity, uint256 totalPaid);

    constructor() Ownable() {}

    // ── Admin functions ──────────────────────────────────────────────────────

    function addFood(
        string memory name,
        uint256 price,
        uint256 stock
    ) external onlyOwner {
        require(price > 0, "Price must be > 0");
        uint256 foodId = foodCount++;
        foodItems[foodId] = FoodItem(name, price, stock, true);
        emit FoodAdded(foodId, name, price);
    }

    function setFoodActive(uint256 foodId, bool active) external onlyOwner {
        require(foodId < foodCount, "Food does not exist");
        foodItems[foodId].active = active;
    }

    function restockFood(uint256 foodId, uint256 amount) external onlyOwner {
        require(foodId < foodCount, "Food does not exist");
        foodItems[foodId].stock += amount;
    }

    // ── Player functions ─────────────────────────────────────────────────────

    /**
     * @dev Purchase food from the vending machine.
     * @param foodId   ID of the food item
     * @param quantity Number of units to buy
     */
    function buyFood(uint256 foodId, uint256 quantity) external payable {
        require(foodId < foodCount, "Food does not exist");
        FoodItem storage item = foodItems[foodId];
        require(item.active, "Food not available");
        require(quantity > 0, "Quantity must be > 0");
        require(item.stock == 0 || item.stock >= quantity, "Insufficient stock");

        uint256 totalCost = item.price * quantity;
        require(msg.value == totalCost, "Incorrect payment");

        if (item.stock > 0) {
            item.stock -= quantity;
        }
        totalRevenue += msg.value;

        purchaseHistory[msg.sender].push(Purchase(foodId, quantity, block.timestamp));

        emit FoodPurchased(msg.sender, foodId, quantity, msg.value);
    }

    function getPurchaseHistory(address buyer) external view returns (Purchase[] memory) {
        return purchaseHistory[buyer];
    }

    function withdraw() external onlyOwner {
        (bool sent, ) = owner().call{value: address(this).balance}("");
        require(sent, "Transfer failed");
    }

    receive() external payable {
        totalRevenue += msg.value;
    }
}
