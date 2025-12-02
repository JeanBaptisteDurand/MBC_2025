import { Outlet, Link, useLocation } from "react-router-dom";
import { Activity, History, Sun, Moon, Hexagon, User } from "lucide-react";
import { ConnectWallet, Wallet, WalletDropdown, WalletDropdownDisconnect } from "@coinbase/onchainkit/wallet";
import { Address, Avatar, Name, Identity } from "@coinbase/onchainkit/identity";
import { useTheme } from "../hooks/useTheme";
import { cn } from "../utils/cn";

export default function Layout() {
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-surface-800 bg-surface-950/80 backdrop-blur-lg">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3 group">
            <div className="relative">
              <Hexagon className="w-8 h-8 text-primary-500 transition-transform group-hover:scale-110" />
              <div className="absolute inset-0 w-8 h-8 bg-primary-500/20 blur-lg group-hover:bg-primary-500/40 transition-colors" />
            </div>
            <span className="font-display text-xl font-bold gradient-text">
              BaseLens
            </span>
          </Link>

          {/* Navigation */}
          <nav className="flex items-center gap-6">
            <Link
              to="/"
              className={cn(
                "flex items-center gap-2 text-sm font-medium transition-colors",
                location.pathname === "/"
                  ? "text-primary-400"
                  : "text-surface-400 hover:text-surface-100"
              )}
            >
              <Activity className="w-4 h-4" />
              Analyze
            </Link>
            <Link
              to="/history"
              className={cn(
                "flex items-center gap-2 text-sm font-medium transition-colors",
                location.pathname === "/history"
                  ? "text-primary-400"
                  : "text-surface-400 hover:text-surface-100"
              )}
            >
              <History className="w-4 h-4" />
              History
            </Link>
            <Link
              to="/profile"
              className={cn(
                "flex items-center gap-2 text-sm font-medium transition-colors",
                location.pathname === "/profile"
                  ? "text-primary-400"
                  : "text-surface-400 hover:text-surface-100"
              )}
            >
              <User className="w-4 h-4" />
              Profile
            </Link>

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
                <Name />
                <Address />
              </ConnectWallet>
              <WalletDropdown>
                <Identity className="px-4 pt-3 pb-2" hasCopyAddressOnClick>
                  <Avatar />
                  <Name />
                  <Address />
                </Identity>
                <WalletDropdownDisconnect />
              </WalletDropdown>
            </Wallet>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* Footer */}
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
    </div>
  );
}

