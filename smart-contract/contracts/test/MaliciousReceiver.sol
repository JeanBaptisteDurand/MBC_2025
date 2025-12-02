// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ITreasuryWithdraw {
    function withdraw(address payable to) external;
}

/**
 * @dev Malicious contract for testing reentrancy protection on withdraw()
 */
contract MaliciousReceiver {
    ITreasuryWithdraw public treasury;
    uint256 public attackCount;
    
    constructor(address _treasury) {
        treasury = ITreasuryWithdraw(_treasury);
    }
    
    function attack() external {
        attackCount = 0;
        treasury.withdraw(payable(address(this)));
    }
    
    receive() external payable {
        if (attackCount < 2 && address(treasury).balance > 0) {
            attackCount++;
            treasury.withdraw(payable(address(this)));
        }
    }
}

