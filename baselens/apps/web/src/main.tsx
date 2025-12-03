import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { ThemeProvider } from "./hooks/useTheme";
import { ToastProvider } from "./components/ui/Toast";
import { OnchainKitProvider } from "./providers/OnchainKitProvider";
import { SmartWalletProvider } from "./providers/SmartWalletProvider";
import "@coinbase/onchainkit/styles.css";
import "./styles/index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      retry: 2,
    },
  },
});

const ZERODEV_PROJECT_ID = import.meta.env.VITE_ZERODEV_PROJECT_ID || "";
const ZERODEV_BUNDLER_URL = import.meta.env.VITE_ZERODEV_BUNDLER_URL || undefined;
const ZERODEV_PAYMASTER_URL = import.meta.env.VITE_ZERODEV_PAYMASTER_URL || undefined;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <OnchainKitProvider>
        <SmartWalletProvider
          projectId={ZERODEV_PROJECT_ID}
          bundlerUrl={ZERODEV_BUNDLER_URL}
          paymasterUrl={ZERODEV_PAYMASTER_URL}
        >
          <BrowserRouter>
            <ThemeProvider>
              <ToastProvider>
                <App />
              </ToastProvider>
            </ThemeProvider>
          </BrowserRouter>
        </SmartWalletProvider>
      </OnchainKitProvider>
    </QueryClientProvider>
  </React.StrictMode>
);

