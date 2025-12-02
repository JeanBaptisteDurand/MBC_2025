import type { Network } from "@baselens/core";

const BASESCAN_URLS: Record<Network, string> = {
  "base-mainnet": "https://basescan.org",
  "base-sepolia": "https://sepolia.basescan.org",
};

export function getBasescanUrl(network: Network): string {
  return BASESCAN_URLS[network];
}

export function getBasescanAddressUrl(network: Network, address: string): string {
  return `${BASESCAN_URLS[network]}/address/${address}`;
}

export function getBasescanTxUrl(network: Network, txHash: string): string {
  return `${BASESCAN_URLS[network]}/tx/${txHash}`;
}

export function getBasescanBlockUrl(network: Network, blockNumber: number): string {
  return `${BASESCAN_URLS[network]}/block/${blockNumber}`;
}

export function shortenAddress(address: string, chars = 4): string {
  if (!address) return "";
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

export function shortenTxHash(hash: string, chars = 6): string {
  if (!hash) return "";
  return `${hash.slice(0, chars + 2)}...${hash.slice(-chars)}`;
}

export function copyToClipboard(text: string): Promise<void> {
  return navigator.clipboard.writeText(text);
}

