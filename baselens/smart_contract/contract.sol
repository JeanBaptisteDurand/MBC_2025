0x3A7F370D0C105Afc23800253504656ae99857bde// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "openzeppelin-contracts/contracts/access/Ownable.sol";
import "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import "openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title TreasurySwap - Simple treasury and fixed-rate ETH/USDC swap for Base Sepolia
/// @notice Educational/testnet-only contract. Not for mainnet use.
contract TreasurySwap is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice USDC token used by the treasury (6 decimals, Base Sepolia USDC in production)
    IERC20 public immutable usdc;

    /// @notice Per-user balances tracked in the contract's internal ledger (for storage/deposit/withdraw)
    mapping(address => uint256) public ethBalances;
    mapping(address => uint256) public usdcBalances;

    /// @notice Treasury balances controlled by the owner (logical bookkeeping)
    uint256 public treasuryEth;
    uint256 public treasuryUsdc;

    /// @notice Aggregate user balances (liabilities)
    uint256 public totalEthUser;
    uint256 public totalUsdcUser;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    /// @notice Emitted when a user deposits ETH
    event DepositEth(address indexed user, uint256 amount);

    /// @notice Emitted when a user withdraws ETH
    event WithdrawEth(address indexed user, uint256 amount);

    /// @notice Emitted when a user deposits USDC
    event DepositUsdc(address indexed user, uint256 amount);

    /// @notice Emitted when a user withdraws USDC
    event WithdrawUsdc(address indexed user, uint256 amount);

    /// @notice Emitted when a user swaps ETH for USDC (wallet → contract → wallet)
    event SwapEthForUsdc(address indexed user, uint256 ethIn, uint256 usdcOut);

    /// @notice Emitted when a user swaps USDC for ETH (wallet → contract → wallet)
    event SwapUsdcForEth(address indexed user, uint256 usdcIn, uint256 ethOut);

    /// @notice Emitted when the owner funds the treasury
    event TreasuryFunded(address indexed owner, uint256 ethAmount, uint256 usdcAmount);

    /// @notice Emitted when the owner withdraws from the treasury
    event TreasuryWithdrawn(address indexed owner, uint256 ethAmount, uint256 usdcAmount);

    /// @notice Emitted on generic ETH reception that is not credited to any user
    event EthReceived(address indexed from, uint256 amount);

    // -------------------------------------------------------------------------
    // Constructor & receive
    // -------------------------------------------------------------------------

    /// @param _usdc Address of the USDC token (Base Sepolia USDC in production)
    constructor(address _usdc) Ownable(msg.sender) {
        require(_usdc != address(0), "USDC address zero");
        usdc = IERC20(_usdc);
    }

    /// @notice Generic ETH reception, not credited to any user
    receive() external payable {
        treasuryEth += msg.value;
        emit EthReceived(msg.sender, msg.value);
    }

    // -------------------------------------------------------------------------
    // User deposit / withdraw - ETH
    // -------------------------------------------------------------------------

    /// @notice Deposit ETH into the contract and credit sender's internal balance
    function depositEth() external payable nonReentrant {
        require(msg.value > 0, "Zero amount");

        ethBalances[msg.sender] += msg.value;
        totalEthUser += msg.value;

        emit DepositEth(msg.sender, msg.value);
    }

    /// @notice Withdraw ETH from sender's internal balance
    /// @param amount Amount of ETH (in wei) to withdraw
    function withdrawEth(uint256 amount) external nonReentrant {
        require(amount > 0, "Zero amount");
        require(ethBalances[msg.sender] >= amount, "Insufficient balance");

        ethBalances[msg.sender] -= amount;
        totalEthUser -= amount;

        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "ETH transfer failed");

        emit WithdrawEth(msg.sender, amount);
    }

    // -------------------------------------------------------------------------
    // User deposit / withdraw - USDC
    // -------------------------------------------------------------------------

    /// @notice Deposit USDC into the contract and credit sender's internal balance
    /// @param amount Amount of USDC (6 decimals) to deposit
    function depositUsdc(uint256 amount) external nonReentrant {
        require(amount > 0, "Zero amount");

        usdc.safeTransferFrom(msg.sender, address(this), amount);

        usdcBalances[msg.sender] += amount;
        totalUsdcUser += amount;

        emit DepositUsdc(msg.sender, amount);
    }

    /// @notice Withdraw USDC from sender's internal balance
    /// @param amount Amount of USDC (6 decimals) to withdraw
    function withdrawUsdc(uint256 amount) external nonReentrant {
        require(amount > 0, "Zero amount");
        require(usdcBalances[msg.sender] >= amount, "Insufficient balance");

        usdcBalances[msg.sender] -= amount;
        totalUsdcUser -= amount;

        usdc.safeTransfer(msg.sender, amount);

        emit WithdrawUsdc(msg.sender, amount);
    }

    // -------------------------------------------------------------------------
    // Swap logic (wallet → contract → wallet, using treasury as counterparty)
    // -------------------------------------------------------------------------

    /// @notice Preview how much USDC user will receive for a given ETH amount
    /// @param ethAmountWei Amount of ETH (wei) to swap
    /// @return usdcAmount Amount of USDC (6 decimals) user will receive
    function previewSwapEthForUsdc(uint256 ethAmountWei) external pure returns (uint256 usdcAmount) {
        require(ethAmountWei > 0, "Zero amount");
        // Normalize 18 decimals (ETH) to 6 decimals (USDC) at fixed 1:1 rate
        usdcAmount = ethAmountWei / 1e12;
        require(usdcAmount > 0, "Too small");
    }

    /// @notice Preview how much ETH user will receive for a given USDC amount
    /// @param usdcAmount Amount of USDC (6 decimals) to swap
    /// @return ethAmountWei Amount of ETH (wei) user will receive
    function previewSwapUsdcForEth(uint256 usdcAmount) external pure returns (uint256 ethAmountWei) {
        require(usdcAmount > 0, "Zero amount");
        // Normalize 6 decimals (USDC) to 18 decimals (ETH) at fixed 1:1 rate
        ethAmountWei = usdcAmount * 1e12;
    }

    /// @notice Swap ETH for USDC at fixed 1:1 rate (1e18 wei = 1e6 USDC units)
    /// @dev User sends ETH via msg.value, receives USDC directly to wallet from treasury
    function swapEthForUsdc() external payable nonReentrant {
        uint256 ethAmountWei = msg.value;
        require(ethAmountWei > 0, "Zero amount");

        // Normalize 18 decimals (ETH) to 6 decimals (USDC)
        uint256 usdcAmount = ethAmountWei / 1e12;
        require(usdcAmount > 0, "Too small");

        // Ensure treasury has enough USDC for the swap
        require(treasuryUsdc >= usdcAmount, "Insufficient treasury USDC");

        // Ensure contract has enough USDC reserves to cover user balances + this swap
        uint256 contractUsdc = usdc.balanceOf(address(this));
        require(
            contractUsdc >= totalUsdcUser + usdcAmount,
            "Insufficient USDC liquidity"
        );

        // User's ETH goes to treasury
        treasuryEth += ethAmountWei;

        // Treasury's USDC goes to user
        treasuryUsdc -= usdcAmount;

        // Send USDC directly to user's wallet
        usdc.safeTransfer(msg.sender, usdcAmount);

        emit SwapEthForUsdc(msg.sender, ethAmountWei, usdcAmount);
    }

    /// @notice Swap USDC for ETH at fixed 1:1 rate (1e6 USDC units = 1e18 wei)
    /// @param usdcAmount Amount of USDC (6 decimals) to swap
    /// @dev User sends USDC via transferFrom, receives ETH directly to wallet from treasury
    function swapUsdcForEth(uint256 usdcAmount) external nonReentrant {
        require(usdcAmount > 0, "Zero amount");

        uint256 ethAmountWei = usdcAmount * 1e12;

        // Ensure treasury has enough ETH for the swap
        require(treasuryEth >= ethAmountWei, "Insufficient treasury ETH");

        // Ensure contract has enough ETH reserves to cover user balances + this swap
        require(
            address(this).balance >= totalEthUser + ethAmountWei,
            "Insufficient ETH liquidity"
        );

        // User's USDC goes to treasury
        usdc.safeTransferFrom(msg.sender, address(this), usdcAmount);
        treasuryUsdc += usdcAmount;

        // Treasury's ETH goes to user
        treasuryEth -= ethAmountWei;

        // Send ETH directly to user's wallet
        (bool success, ) = payable(msg.sender).call{value: ethAmountWei}("");
        require(success, "ETH transfer failed");

        emit SwapUsdcForEth(msg.sender, usdcAmount, ethAmountWei);
    }

    // -------------------------------------------------------------------------
    // Treasury functions (owner only)
    // -------------------------------------------------------------------------

    /// @notice Fund the treasury with ETH. Does not affect user balances.
    function fundTreasuryEth() external payable onlyOwner {
        require(msg.value > 0, "Zero amount");

        treasuryEth += msg.value;

        emit TreasuryFunded(msg.sender, msg.value, 0);
    }

    /// @notice Fund the treasury with USDC. Does not affect user balances.
    /// @param amount Amount of USDC (6 decimals) to send to the treasury
    function fundTreasuryUsdc(uint256 amount) external onlyOwner {
        require(amount > 0, "Zero amount");

        usdc.safeTransferFrom(msg.sender, address(this), amount);

        treasuryUsdc += amount;

        emit TreasuryFunded(msg.sender, 0, amount);
    }

    /// @notice Withdraw ETH and/or USDC from the treasury to the owner
    /// @param ethAmount Amount of ETH (wei) to withdraw from treasury
    /// @param usdcAmount Amount of USDC (6 decimals) to withdraw from treasury
    function withdrawTreasury(uint256 ethAmount, uint256 usdcAmount)
        external
        onlyOwner
        nonReentrant
    {
        if (ethAmount > 0) {
            require(treasuryEth >= ethAmount, "Insufficient treasury ETH");
            // Ensure enough ETH remains to cover all user balances
            require(
                address(this).balance >= ethAmount + totalEthUser,
                "ETH withdraw would break user backing"
            );

            treasuryEth -= ethAmount;
            (bool success, ) = payable(owner()).call{value: ethAmount}("");
            require(success, "ETH transfer failed");
        }

        if (usdcAmount > 0) {
            require(treasuryUsdc >= usdcAmount, "Insufficient treasury USDC");
            // Ensure enough USDC remains to cover all user balances
            require(
                usdc.balanceOf(address(this)) >= usdcAmount + totalUsdcUser,
                "USDC withdraw would break user backing"
            );

            treasuryUsdc -= usdcAmount;

            usdc.safeTransfer(owner(), usdcAmount);
        }

        emit TreasuryWithdrawn(msg.sender, ethAmount, usdcAmount);
    }

    // -------------------------------------------------------------------------
    // View helpers for dapp UI
    // -------------------------------------------------------------------------

    /// @notice Get a user's internal ETH & USDC balances
    function getUserBalances(address user)
        external
        view
        returns (uint256 ethBalance, uint256 usdcBalance)
    {
        ethBalance = ethBalances[user];
        usdcBalance = usdcBalances[user];
    }

    /// @notice Get the treasury's internal ETH & USDC balances
    function getTreasuryBalances()
        external
        view
        returns (uint256 ethTreasury, uint256 usdcTreasury)
    {
        ethTreasury = treasuryEth;
        usdcTreasury = treasuryUsdc;
    }

    /// @notice Get the on-chain reserves held by the contract (ETH & USDC)
    function getContractReserves()
        external
        view
        returns (uint256 ethReserve, uint256 usdcReserve)
    {
        ethReserve = address(this).balance;
        usdcReserve = usdc.balanceOf(address(this));
    }

    /// @notice Get the aggregate user balances (liabilities)
    function getTotalUserBalances()
        external
        view
        returns (uint256 totalEth, uint256 totalUsdc)
    {
        totalEth = totalEthUser;
        totalUsdc = totalUsdcUser;
    }
}