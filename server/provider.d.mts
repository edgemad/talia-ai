import type { Request } from "node:http";

export interface ProviderLike {
  baseUrl: string;
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
}

export declare function buildProviderRequest(
  provider: ProviderLike,
  messages: { role: string; content: string }[],
  model: string,
): Request;

export declare function validateProviderConfig(provider: ProviderLike | null | undefined): boolean;
