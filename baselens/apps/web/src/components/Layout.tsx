import { useState } from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import { Activity, History, Sun, Moon, Hexagon, BotMessageSquare, User, LogIn, Users, Menu, X } from "lucide-react";
import { ConnectWallet, Wallet, WalletDropdown, WalletDropdownDisconnect } from "@coinbase/onchainkit/wallet";
import { Address, Avatar, Name, Identity } from "@coinbase/onchainkit/identity";
import { useAccount } from "wagmi";
import { useTheme } from "../hooks/useTheme";
import { useAuth } from "../contexts/AuthContext";
import { cn } from "../utils/cn";

export default function Layout() {
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const { address, isConnected } = useAccount();
  const { isAuthenticated, login, isLoading: authLoading } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { to: "/chat", label: "Chat", icon: BotMessageSquare },
    { to: "/analyze", label: "Analyze", icon: Activity },
    { to: "/history", label: "History", icon: History },
    { to: "/profile", label: "Profile", icon: User },
    { to: "/team", label: "Team", icon: Users },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-surface-800 bg-surface-950/80 backdrop-blur-lg">
        <div className="w-full max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3 group flex-shrink-0">
            <div className="relative">
              <Hexagon className="w-8 h-8 text-primary-500 transition-transform group-hover:scale-110" />
              <div className="absolute inset-0 w-8 h-8 bg-primary-500/20 blur-lg group-hover:bg-primary-500/40 transition-colors" />
            </div>
            <span className="font-display text-xl font-bold gradient-text">
              BaseLens
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-6">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={cn(
                  "flex items-center gap-2 text-sm font-medium transition-colors",
                  location.pathname === link.to
                    ? "text-primary-400"
                    : "text-surface-400 hover:text-surface-100"
                )}
              >
                <link.icon className="w-4 h-4" />
                {link.label}
              </Link>
            ))}

            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg text-surface-400 hover:text-surface-100 hover:bg-surface-800 transition-colors"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? (
                <Sun className="w-5 h-5" />
              ) : (
                <Moon className="w-5 h-5" />
              )}
            </button>

            {/* Wallet Connect */}
            <Wallet>
              <ConnectWallet>
                <Avatar className="h-6 w-6" />
                {/* <Name /> */}
                <Address />
              </ConnectWallet>
              <WalletDropdown>
                <Identity className="px-4 pt-3 pb-2" hasCopyAddressOnClick>
                  <Avatar />
                  {/* <Name /> */}
                  <Address />
                </Identity>
                <WalletDropdownDisconnect />
              </WalletDropdown>
            </Wallet>

            {/* Login Button */}
            {isConnected && address && !isAuthenticated && !authLoading && (
              <button
                onClick={async () => {
                  try {
                    await login();
                  } catch (error) {
                    console.error("Login failed:", error);
                  }
                }}
                className="btn btn-primary btn-sm flex items-center gap-2 whitespace-nowrap"
              >
                <LogIn className="w-4 h-4" />
                Sign In
              </button>
            )}
          </nav>

          {/* Mobile Navigation Controls */}
          <div className="flex lg:hidden items-center gap-2">
            {/* Theme Toggle - Mobile */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg text-surface-400 hover:text-surface-100 hover:bg-surface-800 transition-colors"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? (
                <Sun className="w-5 h-5" />
              ) : (
                <Moon className="w-5 h-5" />
              )}
            </button>

            {/* Wallet Connect - Mobile */}
            <Wallet>
              <ConnectWallet>
                <Avatar className="h-6 w-6" />
              </ConnectWallet>
              <WalletDropdown>
                <Identity className="px-4 pt-3 pb-2" hasCopyAddressOnClick>
                  <Avatar />
                  <Address />
                </Identity>
                <WalletDropdownDisconnect />
              </WalletDropdown>
            </Wallet>

            {/* Mobile Menu Toggle */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg text-surface-400 hover:text-surface-100 hover:bg-surface-800 transition-colors"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? (
                <X className="w-6 h-6" />
              ) : (
                <Menu className="w-6 h-6" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Menu Dropdown */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-surface-800 bg-surface-950/95 backdrop-blur-lg">
            <nav className="flex flex-col py-4 px-4 space-y-1">
              {navLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors",
                    location.pathname === link.to
                      ? "text-primary-400 bg-primary-500/10"
                      : "text-surface-400 hover:text-surface-100 hover:bg-surface-800"
                  )}
                >
                  <link.icon className="w-5 h-5" />
                  {link.label}
                </Link>
              ))}

              {/* Login Button - Mobile */}
              {isConnected && address && !isAuthenticated && !authLoading && (
                <button
                  onClick={async () => {
                    try {
                      await login();
                      setMobileMenuOpen(false);
                    } catch (error) {
                      console.error("Login failed:", error);
                    }
                  }}
                  className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-primary-400 hover:bg-primary-500/10 transition-colors"
                >
                  <LogIn className="w-5 h-5" />
                  Sign In
                </button>
              )}
            </nav>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* Footer */}
      {!(location.pathname.startsWith("/graph") || location.pathname === "/chat") && (
        <footer className="border-t border-surface-800 py-6">
          <div className="container mx-auto px-4 text-center text-surface-500 text-sm">
            <p>
              BaseLens — Smart Contract Analysis for{" "}
              <a
                href="https://base.org"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-400 hover:underline"
              >
                Base L2
              </a>
            </p>
          </div>
        </footer>
      )}
    </div>
  );
}

