// ============================================
// Auth Context - JWT Token Management
// ============================================

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { useAccount, useWalletClient } from "wagmi";
import { api } from "../api/client";

const AUTH_MESSAGE = "Sign this message to authenticate with BaseLens";
const TOKEN_STORAGE_KEY = "baselens_auth_token";
const USER_STORAGE_KEY = "baselens_user";

interface User {
  id: string;
  address: string;
  smart_wallet_enabled: boolean;
  smart_wallet_address: string | null;
  createdAt?: string;
  updatedAt?: string;
}

interface AuthContextType {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: () => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load token from localStorage on mount
  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
    const storedUser = localStorage.getItem(USER_STORAGE_KEY);

    if (storedToken) {
      setToken(storedToken);
    }

    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (e) {
        console.error("Failed to parse stored user:", e);
      }
    }

    setIsLoading(false);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
    console.log("[Auth] Logged out");
  }, []);

  // Clear auth when wallet disconnects or address changes
  useEffect(() => {
    if (!isConnected) {
      // Wallet disconnected - clear JWT
      console.log("[Auth] Wallet disconnected, clearing JWT");
      logout();
    } else if (address && user) {
      // Wallet connected but address changed - clear JWT if address doesn't match
      const normalizedStoredAddress = user.address.toLowerCase();
      const normalizedCurrentAddress = address.toLowerCase();

      if (normalizedStoredAddress !== normalizedCurrentAddress) {
        console.log("[Auth] Wallet address changed, clearing JWT");
        console.log(`[Auth] Stored: ${normalizedStoredAddress}, Current: ${normalizedCurrentAddress}`);
        logout();
      }
    }
  }, [isConnected, address, user, logout]);

  const login = async () => {
    if (!address || !walletClient) {
      throw new Error("Wallet not connected");
    }

    try {
      setIsLoading(true);

      // Sign the auth message using walletClient
      const signature = await walletClient.signMessage({
        message: AUTH_MESSAGE,
      });

      // Send to backend
      const response = await api.post<{
        token: string;
        user: User;
      }>("/api/auth/login", {
        address,
        signature,
        message: AUTH_MESSAGE,
      });

      // Store token and user
      setToken(response.token);
      setUser(response.user);
      localStorage.setItem(TOKEN_STORAGE_KEY, response.token);
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(response.user));

      console.log("[Auth] Login successful:", response.user.address);
    } catch (error) {
      console.error("[Auth] Login failed:", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };


  const refreshUser = async () => {
    // This could be used to refresh user data from the backend
    // For now, we'll just reload from localStorage
    const storedUser = localStorage.getItem(USER_STORAGE_KEY);
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (e) {
        console.error("Failed to parse stored user:", e);
      }
    }
  };

  const value: AuthContextType = {
    token,
    user,
    isAuthenticated: !!token && !!user,
    isLoading,
    login,
    logout,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
