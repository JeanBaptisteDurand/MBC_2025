// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title TreasuryPayment
 * @dev A secure treasury contract for handling one-time payments on Base testnet
 * 
 * Features:
 * - Fixed payment amount in native ETH
 * - Reentrancy protection on all state-changing functions
 * - Owner-only withdrawal capability
 * - Event emissions for tracking payments and withdrawals
 * 
 * Security:
 * - Uses OpenZeppelin's Ownable for access control
 * - Uses OpenZeppelin's ReentrancyGuard to prevent reentrancy attacks
 * - Validates payment amounts before accepting
 */
contract TreasuryPayment is Ownable, ReentrancyGuard {
    
    // Fixed payment amount: 0.0001 ETH (10^14 wei)
    uint256 public constant PAYMENT_AMOUNT = 0.0001 ether;
    
    // Events
    event PaymentReceived(
        address indexed payer, 
        uint256 amount, 
        uint256 timestamp,
        string text
    );
    
    event Withdrawal(
        address indexed to, 
        uint256 amount, 
        uint256 timestamp
    );
    
    /**
     * @dev Constructor sets the deployer as the owner
     */
    constructor() Ownable(msg.sender) {
        // Owner is set via Ownable constructor
    }
    
    /**
     * @dev Allows users to make a payment to the treasury with a text message
     * @param text The text message to send with the payment
     * Requirements:
     * - msg.value must be at least PAYMENT_AMOUNT
     * - Protected against reentrancy
     * 
     * Emits a {PaymentReceived} event with text
     */
    function pay(string memory text) external payable nonReentrant {
        require(
            msg.value >= PAYMENT_AMOUNT, 
            "TreasuryPayment: Insufficient payment amount"
        );
        
        emit PaymentReceived(msg.sender, msg.value, block.timestamp, text);
    }
    
    /**
     * @dev Allows the owner to withdraw all funds from the treasury
     * @param to The address to send the funds to
     * 
     * Requirements:
     * - Only callable by the contract owner
     * - Protected against reentrancy
     * - The contract must have a balance to withdraw
     * 
     * Emits a {Withdrawal} event
     */
    function withdraw(address payable to) external onlyOwner nonReentrant {
        require(to != address(0), "TreasuryPayment: Cannot withdraw to zero address");
        
        uint256 balance = address(this).balance;
        require(balance > 0, "TreasuryPayment: No funds to withdraw");
        
        emit Withdrawal(to, balance, block.timestamp);
        
        // Transfer funds using call for better security and gas efficiency
        (bool success, ) = to.call{value: balance}("");
        require(success, "TreasuryPayment: Transfer failed");
    }
    
    /**
     * @dev Returns the current balance of the treasury
     * @return The balance in wei
     */
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }
    
    /**
     * @dev Fallback function to reject direct ETH transfers
     * Users must use the pay(string) function
     */
    receive() external payable {
        revert("TreasuryPayment: Please use the pay(string) function");
    }
}

