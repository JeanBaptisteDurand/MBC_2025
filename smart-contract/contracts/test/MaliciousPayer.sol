// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ITreasury {
    function pay(string memory text) external payable;
}

/**
 * @dev Malicious contract for testing reentrancy protection on pay()
 */
contract MaliciousPayer {
    ITreasury public treasury;
    uint256 public attackCount;
    
    constructor(address _treasury) {
        treasury = ITreasury(_treasury);
    }
    
    function attack() external {
        attackCount = 0;
        treasury.pay{value: 0.0001 ether}("");
    }
    
    receive() external payable {
        if (attackCount < 2) {
            attackCount++;
            treasury.pay{value: 0.0001 ether}("");
        }
    }
}

