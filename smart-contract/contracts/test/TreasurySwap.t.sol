// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/TreasurySwap.sol";

contract MockUSDC is IERC20 {
    string public constant name = "Mock USDC";
    string public constant symbol = "mUSDC";
    uint8 public constant decimals = 6;

    uint256 public override totalSupply;
    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _allowances;

    function balanceOf(address account) external view override returns (uint256) {
        return _balances[account];
    }

    function transfer(address to, uint256 amount) external override returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function allowance(address owner, address spender) external view override returns (uint256) {
        return _allowances[owner][spender];
    }

    function approve(address spender, uint256 amount) external override returns (bool) {
        _allowances[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external override returns (bool) {
        uint256 currentAllowance = _allowances[from][msg.sender];
        require(currentAllowance >= amount, "ERC20: insufficient allowance");
        unchecked {
            _allowances[from][msg.sender] = currentAllowance - amount;
        }
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(to != address(0), "ERC20: transfer to zero");
        uint256 fromBal = _balances[from];
        require(fromBal >= amount, "ERC20: transfer exceeds balance");
        unchecked {
            _balances[from] = fromBal - amount;
            _balances[to] += amount;
        }
        emit Transfer(from, to, amount);
    }

    function mint(address to, uint256 amount) external {
        require(to != address(0), "mint to zero");
        totalSupply += amount;
        _balances[to] += amount;
        emit Transfer(address(0), to, amount);
    }
}

contract TreasurySwapTest is Test {
    TreasurySwap public treasury;
    MockUSDC public usdc;

    address public owner = address(this);
    address public user = address(0x1);
    address public other = address(0x2);

    // Allow this contract to receive ETH
    receive() external payable {}

    // Helper to fund treasury with both assets
    function _fundTreasury(uint256 ethAmount, uint256 usdcAmount) internal {
        if (ethAmount > 0) {
            vm.deal(owner, ethAmount);
            treasury.fundTreasuryEth{value: ethAmount}();
        }
        if (usdcAmount > 0) {
            usdc.mint(owner, usdcAmount);
            usdc.approve(address(treasury), usdcAmount);
            treasury.fundTreasuryUsdc(usdcAmount);
        }
    }

    function setUp() public {
        usdc = new MockUSDC();
        treasury = new TreasurySwap(address(usdc));
    }

    // =========================================================================
    // 1. DEPOSIT / WITHDRAW TESTS
    // =========================================================================

    function test_DepositEthUpdatesBalances() public {
        vm.deal(user, 10 ether);

        vm.prank(user);
        treasury.depositEth{value: 1 ether}();

        assertEq(treasury.ethBalances(user), 1 ether);
        (uint256 totalEthUser, ) = treasury.getTotalUserBalances();
        assertEq(totalEthUser, 1 ether);
        assertEq(address(treasury).balance, 1 ether);
    }

    function test_DepositEthRevertsOnZeroAmount() public {
        vm.deal(user, 10 ether);
        vm.prank(user);
        vm.expectRevert("Zero amount");
        treasury.depositEth{value: 0}();
    }

    function test_WithdrawEthReducesBalancesAndTransfers() public {
        vm.deal(user, 10 ether);

        vm.prank(user);
        treasury.depositEth{value: 2 ether}();

        uint256 userBalanceBefore = user.balance;

        vm.prank(user);
        treasury.withdrawEth(1 ether);

        assertEq(treasury.ethBalances(user), 1 ether);
        (uint256 totalEthUser, ) = treasury.getTotalUserBalances();
        assertEq(totalEthUser, 1 ether);
        assertEq(user.balance, userBalanceBefore + 1 ether);
    }

    function test_WithdrawEthRevertsOnInsufficientBalance() public {
        vm.deal(user, 10 ether);
        vm.prank(user);
        treasury.depositEth{value: 0.5 ether}();

        vm.prank(user);
        vm.expectRevert("Insufficient balance");
        treasury.withdrawEth(1 ether);
    }

    function test_DepositUsdcUpdatesBalances() public {
        uint256 amount = 1_000_000; // 1 USDC (6 decimals)
        usdc.mint(user, amount);

        vm.startPrank(user);
        usdc.approve(address(treasury), amount);
        treasury.depositUsdc(amount);
        vm.stopPrank();

        assertEq(treasury.usdcBalances(user), amount);
        (, uint256 totalUsdcUser) = treasury.getTotalUserBalances();
        assertEq(totalUsdcUser, amount);
        assertEq(usdc.balanceOf(address(treasury)), amount);
    }

    function test_WithdrawUsdcReducesBalancesAndTransfers() public {
        uint256 amount = 2_000_000; // 2 USDC
        usdc.mint(user, amount);

        vm.startPrank(user);
        usdc.approve(address(treasury), amount);
        treasury.depositUsdc(amount);
        vm.stopPrank();

        uint256 userBalanceBefore = usdc.balanceOf(user);

        vm.prank(user);
        treasury.withdrawUsdc(500_000); // 0.5 USDC

        assertEq(treasury.usdcBalances(user), 1_500_000);
        (, uint256 totalUsdcUser) = treasury.getTotalUserBalances();
        assertEq(totalUsdcUser, 1_500_000);
        assertEq(usdc.balanceOf(user), userBalanceBefore + 500_000);
    }

    // =========================================================================
    // 2. SWAP TESTS (Wallet → Contract → Wallet)
    // =========================================================================

    function test_SwapEthForUsdc_NoInternalBalanceChange() public {
        // Fund treasury with USDC
        _fundTreasury(0, 10_000_000); // 10 USDC

        // User has no internal balance
        assertEq(treasury.ethBalances(user), 0);
        assertEq(treasury.usdcBalances(user), 0);

        uint256 ethAmount = 1 ether;
        uint256 expectedUsdc = 1_000_000; // 1 USDC

        vm.deal(user, 10 ether);
        uint256 userUsdcBefore = usdc.balanceOf(user);
        uint256 treasuryEthBefore;
        uint256 treasuryUsdcBefore;
        (treasuryEthBefore, treasuryUsdcBefore) = treasury.getTreasuryBalances();

        // Swap: user sends ETH, receives USDC directly
        vm.prank(user);
        treasury.swapEthForUsdc{value: ethAmount}();

        // Verify user received USDC in wallet
        assertEq(usdc.balanceOf(user), userUsdcBefore + expectedUsdc);

        // Verify internal balances are NOT changed
        assertEq(treasury.ethBalances(user), 0);
        assertEq(treasury.usdcBalances(user), 0);

        // Verify treasury balances changed
        (uint256 treasuryEthAfter, uint256 treasuryUsdcAfter) = treasury.getTreasuryBalances();
        assertEq(treasuryEthAfter, treasuryEthBefore + ethAmount);
        assertEq(treasuryUsdcAfter, treasuryUsdcBefore - expectedUsdc);
    }

    function test_SwapUsdcForEth_NoInternalBalanceChange() public {
        // Fund treasury with ETH
        _fundTreasury(10 ether, 0);

        uint256 usdcAmount = 2_000_000; // 2 USDC
        uint256 expectedEth = 2 ether;

        usdc.mint(user, usdcAmount);
        vm.startPrank(user);
        usdc.approve(address(treasury), usdcAmount);
        vm.stopPrank();

        uint256 userEthBefore = user.balance;
        uint256 treasuryEthBefore;
        uint256 treasuryUsdcBefore;
        (treasuryEthBefore, treasuryUsdcBefore) = treasury.getTreasuryBalances();

        // Swap: user sends USDC, receives ETH directly
        vm.prank(user);
        treasury.swapUsdcForEth(usdcAmount);

        // Verify user received ETH in wallet
        assertEq(user.balance, userEthBefore + expectedEth);

        // Verify internal balances are NOT changed
        assertEq(treasury.ethBalances(user), 0);
        assertEq(treasury.usdcBalances(user), 0);

        // Verify treasury balances changed
        (uint256 treasuryEthAfter, uint256 treasuryUsdcAfter) = treasury.getTreasuryBalances();
        assertEq(treasuryEthAfter, treasuryEthBefore - expectedEth);
        assertEq(treasuryUsdcAfter, treasuryUsdcBefore + usdcAmount);
    }

    function test_SwapEthForUsdc_RevertsOnZeroAmount() public {
        _fundTreasury(0, 10_000_000);
        vm.deal(user, 10 ether);

        vm.prank(user);
        vm.expectRevert("Zero amount");
        treasury.swapEthForUsdc{value: 0}();
    }

    function test_SwapEthForUsdc_RevertsOnTooSmallAmount() public {
        _fundTreasury(0, 10_000_000);
        vm.deal(user, 10 ether);

        vm.prank(user);
        vm.expectRevert("Too small");
        treasury.swapEthForUsdc{value: 1e11}(); // Less than 1e12 wei
    }

    function test_SwapEthForUsdc_RevertsOnInsufficientTreasuryUsdc() public {
        _fundTreasury(0, 500_000); // Only 0.5 USDC in treasury
        vm.deal(user, 10 ether);

        vm.prank(user);
        vm.expectRevert("Insufficient treasury USDC");
        treasury.swapEthForUsdc{value: 1 ether}(); // Needs 1 USDC
    }

    function test_SwapUsdcForEth_RevertsOnInsufficientTreasuryEth() public {
        _fundTreasury(0.5 ether, 0); // Only 0.5 ETH in treasury
        uint256 usdcAmount = 2_000_000; // Needs 2 ETH

        usdc.mint(user, usdcAmount);
        vm.startPrank(user);
        usdc.approve(address(treasury), usdcAmount);
        vm.stopPrank();

        vm.prank(user);
        vm.expectRevert("Insufficient treasury ETH");
        treasury.swapUsdcForEth(usdcAmount);
    }

    function test_SwapWorksWithUserDeposits() public {
        // User can have deposits AND do swaps (separate features)
        _fundTreasury(10 ether, 10_000_000);

        // User deposits some ETH for storage
        vm.deal(user, 20 ether);
        vm.prank(user);
        treasury.depositEth{value: 5 ether}();
        assertEq(treasury.ethBalances(user), 5 ether);

        // User swaps ETH for USDC (wallet → wallet)
        uint256 userUsdcBefore = usdc.balanceOf(user);
        vm.prank(user);
        treasury.swapEthForUsdc{value: 1 ether}();

        // Internal balance unchanged
        assertEq(treasury.ethBalances(user), 5 ether);
        // User received USDC in wallet
        assertEq(usdc.balanceOf(user), userUsdcBefore + 1_000_000);
    }

    // =========================================================================
    // 3. PREVIEW FUNCTION TESTS
    // =========================================================================

    function test_PreviewSwapEthForUsdc() public {
        uint256 ethAmount = 1 ether;
        uint256 expectedUsdc = 1_000_000; // 1 USDC

        uint256 previewedUsdc = treasury.previewSwapEthForUsdc(ethAmount);
        assertEq(previewedUsdc, expectedUsdc);
    }

    function test_PreviewSwapEthForUsdc_LargeAmount() public {
        uint256 ethAmount = 100 ether;
        uint256 expectedUsdc = 100_000_000; // 100 USDC

        uint256 previewedUsdc = treasury.previewSwapEthForUsdc(ethAmount);
        assertEq(previewedUsdc, expectedUsdc);
    }

    function test_PreviewSwapEthForUsdc_RevertsOnZero() public {
        vm.expectRevert("Zero amount");
        treasury.previewSwapEthForUsdc(0);
    }

    function test_PreviewSwapEthForUsdc_RevertsOnTooSmall() public {
        vm.expectRevert("Too small");
        treasury.previewSwapEthForUsdc(1e11); // Less than 1e12
    }

    function test_PreviewSwapUsdcForEth() public {
        uint256 usdcAmount = 1_000_000; // 1 USDC
        uint256 expectedEth = 1 ether;

        uint256 previewedEth = treasury.previewSwapUsdcForEth(usdcAmount);
        assertEq(previewedEth, expectedEth);
    }

    function test_PreviewSwapUsdcForEth_RevertsOnZero() public {
        vm.expectRevert("Zero amount");
        treasury.previewSwapUsdcForEth(0);
    }

    function test_PreviewMatchesActualSwap() public {
        _fundTreasury(10 ether, 10_000_000);

        uint256 ethAmount = 1.5 ether;
        uint256 previewedUsdc = treasury.previewSwapEthForUsdc(ethAmount);

        vm.deal(user, 10 ether);
        uint256 userUsdcBefore = usdc.balanceOf(user);

        vm.prank(user);
        treasury.swapEthForUsdc{value: ethAmount}();

        uint256 receivedUsdc = usdc.balanceOf(user) - userUsdcBefore;
        assertEq(receivedUsdc, previewedUsdc);
    }

    // =========================================================================
    // 4. TREASURY MANAGEMENT TESTS
    // =========================================================================

    function test_FundTreasuryEth() public {
        vm.deal(owner, 10 ether);
        treasury.fundTreasuryEth{value: 5 ether}();

        (uint256 treasuryEth, ) = treasury.getTreasuryBalances();
        assertEq(treasuryEth, 5 ether);
        assertEq(address(treasury).balance, 5 ether);
    }

    function test_FundTreasuryUsdc() public {
        uint256 amount = 5_000_000;
        usdc.mint(owner, amount);
        usdc.approve(address(treasury), amount);

        treasury.fundTreasuryUsdc(amount);

        (, uint256 treasuryUsdc) = treasury.getTreasuryBalances();
        assertEq(treasuryUsdc, amount);
        assertEq(usdc.balanceOf(address(treasury)), amount);
    }

    function test_WithdrawTreasuryEth() public {
        _fundTreasury(10 ether, 10_000_000);

        uint256 ownerBalanceBefore = owner.balance;
        treasury.withdrawTreasury(3 ether, 0);

        (uint256 treasuryEth, ) = treasury.getTreasuryBalances();
        assertEq(treasuryEth, 7 ether);
        assertEq(owner.balance, ownerBalanceBefore + 3 ether);
    }

    function test_WithdrawTreasuryUsdc() public {
        _fundTreasury(10 ether, 10_000_000);

        uint256 ownerUsdcBefore = usdc.balanceOf(owner);
        treasury.withdrawTreasury(0, 3_000_000);

        (, uint256 treasuryUsdc) = treasury.getTreasuryBalances();
        assertEq(treasuryUsdc, 7_000_000);
        assertEq(usdc.balanceOf(owner), ownerUsdcBefore + 3_000_000);
    }

    function test_WithdrawTreasury_RevertsOnInsufficientTreasury() public {
        _fundTreasury(5 ether, 5_000_000);

        vm.expectRevert("Insufficient treasury ETH");
        treasury.withdrawTreasury(6 ether, 0);

        vm.expectRevert("Insufficient treasury USDC");
        treasury.withdrawTreasury(0, 6_000_000);
    }

    function test_WithdrawTreasury_RespectsUserBacking() public {
        // This test verifies that treasury withdrawals respect user backing.
        // The backing check ensures: balance >= withdrawal + totalEthUser
        
        // Setup: Users have deposits
        vm.deal(user, 10 ether);
        vm.prank(user);
        treasury.depositEth{value: 5 ether}(); // totalEthUser = 5 ETH
        
        usdc.mint(user, 5_000_000);
        vm.startPrank(user);
        usdc.approve(address(treasury), 5_000_000);
        treasury.depositUsdc(5_000_000);
        vm.stopPrank();
        
        // Fund treasury
        _fundTreasury(10 ether, 10_000_000);
        
        // Contract balance = 15 ETH (5 user + 10 treasury)
        // Can safely withdraw up to 10 ETH (leaves 5 for users)
        treasury.withdrawTreasury(10 ether, 0);
        
        // Contract balance = 13 USDC (5 user + 8 remaining treasury)
        // Can safely withdraw remaining treasury USDC (leaves 5 for users)
        treasury.withdrawTreasury(0, 8_000_000);
        
        // Verify user balances are intact
        assertEq(treasury.ethBalances(user), 5 ether);
        assertEq(treasury.usdcBalances(user), 5_000_000);
        
        // Verify contract still has enough to cover users
        (uint256 totalEthUser, uint256 totalUsdcUser) = treasury.getTotalUserBalances();
        assertGe(address(treasury).balance, totalEthUser);
        assertGe(usdc.balanceOf(address(treasury)), totalUsdcUser);
    }

    function test_Revert_NonOwnerFundingTreasury() public {
        vm.deal(other, 1 ether);
        vm.prank(other);
        vm.expectRevert();
        treasury.fundTreasuryEth{value: 0.5 ether}();

        usdc.mint(other, 1_000_000);
        vm.startPrank(other);
        usdc.approve(address(treasury), 1_000_000);
        vm.expectRevert();
        treasury.fundTreasuryUsdc(1_000_000);
        vm.stopPrank();
    }

    function test_Revert_NonOwnerWithdrawTreasury() public {
        _fundTreasury(5 ether, 5_000_000);
        vm.prank(other);
        vm.expectRevert();
        treasury.withdrawTreasury(1 ether, 1_000_000);
    }

    // =========================================================================
    // 5. RECEIVE FUNCTION TEST
    // =========================================================================

    function test_ReceiveCreditsTreasury() public {
        vm.deal(user, 5 ether);
        
        (uint256 treasuryEthBefore, ) = treasury.getTreasuryBalances();
        assertEq(treasuryEthBefore, 0);

        // Send ETH directly to contract (triggers receive)
        vm.prank(user);
        (bool success, ) = address(treasury).call{value: 2 ether}("");
        assertTrue(success);

        (uint256 treasuryEthAfter, ) = treasury.getTreasuryBalances();
        assertEq(treasuryEthAfter, treasuryEthBefore + 2 ether);
    }

    // =========================================================================
    // 6. SECURITY TESTS
    // =========================================================================

    function test_UserBalanceBackingInvariant() public {
        // User deposits
        vm.deal(user, 10 ether);
        vm.prank(user);
        treasury.depositEth{value: 5 ether}();

        usdc.mint(user, 5_000_000);
        vm.startPrank(user);
        usdc.approve(address(treasury), 5_000_000);
        treasury.depositUsdc(5_000_000);
        vm.stopPrank();

        // Invariant: contract balance >= user balances
        (uint256 totalEthUser, uint256 totalUsdcUser) = treasury.getTotalUserBalances();
        assertGe(address(treasury).balance, totalEthUser);
        assertGe(usdc.balanceOf(address(treasury)), totalUsdcUser);

        // Fund treasury with additional assets
        _fundTreasury(10 ether, 10_000_000);
        
        // Invariant still holds before withdrawal
        assertGe(address(treasury).balance, totalEthUser);
        assertGe(usdc.balanceOf(address(treasury)), totalUsdcUser);

        // Withdraw from treasury (should respect backing)
        treasury.withdrawTreasury(3 ether, 3_000_000);

        // Invariant still holds after withdrawal
        assertGe(address(treasury).balance, totalEthUser);
        assertGe(usdc.balanceOf(address(treasury)), totalUsdcUser);
    }

    function test_SwapDoesNotAffectUserDeposits() public {
        _fundTreasury(10 ether, 10_000_000);

        // User deposits for storage
        vm.deal(user, 10 ether);
        vm.prank(user);
        treasury.depositEth{value: 3 ether}();
        assertEq(treasury.ethBalances(user), 3 ether);

        // User swaps (separate from deposits)
        vm.prank(user);
        treasury.swapEthForUsdc{value: 2 ether}();

        // Deposit balance unchanged
        assertEq(treasury.ethBalances(user), 3 ether);
        (uint256 totalEthUser, ) = treasury.getTotalUserBalances();
        assertEq(totalEthUser, 3 ether);
    }

    // =========================================================================
    // 7. VIEW FUNCTION TESTS
    // =========================================================================

    function test_GetUserBalances() public {
        vm.deal(user, 10 ether);
        vm.prank(user);
        treasury.depositEth{value: 2 ether}();

        usdc.mint(user, 3_000_000);
        vm.startPrank(user);
        usdc.approve(address(treasury), 3_000_000);
        treasury.depositUsdc(3_000_000);
        vm.stopPrank();

        (uint256 ethBal, uint256 usdcBal) = treasury.getUserBalances(user);
        assertEq(ethBal, 2 ether);
        assertEq(usdcBal, 3_000_000);
    }

    function test_GetTreasuryBalances() public {
        _fundTreasury(5 ether, 5_000_000);

        (uint256 ethTreasury, uint256 usdcTreasury) = treasury.getTreasuryBalances();
        assertEq(ethTreasury, 5 ether);
        assertEq(usdcTreasury, 5_000_000);
    }

    function test_GetContractReserves() public {
        vm.deal(user, 5 ether);
        vm.prank(user);
        treasury.depositEth{value: 2 ether}();

        _fundTreasury(3 ether, 3_000_000);

        (uint256 ethReserve, uint256 usdcReserve) = treasury.getContractReserves();
        assertEq(ethReserve, 5 ether); // 2 (user) + 3 (treasury)
        assertEq(usdcReserve, 3_000_000);
    }

    function test_GetTotalUserBalances() public {
        vm.deal(user, 10 ether);
        vm.prank(user);
        treasury.depositEth{value: 4 ether}();

        usdc.mint(user, 2_000_000);
        vm.startPrank(user);
        usdc.approve(address(treasury), 2_000_000);
        treasury.depositUsdc(2_000_000);
        vm.stopPrank();

        (uint256 totalEth, uint256 totalUsdc) = treasury.getTotalUserBalances();
        assertEq(totalEth, 4 ether);
        assertEq(totalUsdc, 2_000_000);
    }

    // =========================================================================
    // 8. EDGE CASES
    // =========================================================================

    function test_MultipleSwapsInSequence() public {
        _fundTreasury(10 ether, 10_000_000);
        vm.deal(user, 10 ether);

        // First swap
        vm.prank(user);
        treasury.swapEthForUsdc{value: 1 ether}();
        assertEq(usdc.balanceOf(user), 1_000_000);

        // Second swap
        vm.prank(user);
        treasury.swapEthForUsdc{value: 2 ether}();
        assertEq(usdc.balanceOf(user), 3_000_000);

        // Reverse swap
        usdc.mint(user, 1_000_000);
        vm.startPrank(user);
        usdc.approve(address(treasury), 1_000_000);
        vm.stopPrank();

        uint256 userEthBefore = user.balance;
        vm.prank(user);
        treasury.swapUsdcForEth(1_000_000);
        assertEq(user.balance, userEthBefore + 1 ether);
    }

    function test_SwapMinimumAmount() public {
        _fundTreasury(0, 10_000_000);
        vm.deal(user, 10 ether);

        // Minimum swap: 1e12 wei (0.000001 ETH = 0.000001 USDC)
        uint256 minEth = 1e12;
        uint256 previewUsdc = treasury.previewSwapEthForUsdc(minEth);
        assertEq(previewUsdc, 1);

        vm.prank(user);
        treasury.swapEthForUsdc{value: minEth}();
        assertEq(usdc.balanceOf(user), 1);
    }

    function test_SwapAndDepositAreSeparate() public {
        _fundTreasury(10 ether, 10_000_000);

        vm.deal(user, 10 ether);

        // Deposit
        vm.prank(user);
        treasury.depositEth{value: 3 ether}();
        assertEq(treasury.ethBalances(user), 3 ether);

        // Swap (from wallet, not from deposit)
        vm.prank(user);
        treasury.swapEthForUsdc{value: 2 ether}();

        // Deposits still there
        assertEq(treasury.ethBalances(user), 3 ether);
        // User received USDC from swap
        assertEq(usdc.balanceOf(user), 2_000_000);
    }
}
