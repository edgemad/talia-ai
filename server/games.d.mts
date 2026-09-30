export interface GameDef {
  id: string;
  engine: string;
  name: string;
  emoji: string;
  tagline: string;
  category: string;
  ages: string;
  needsLlm: boolean;
  howTo: string;
  builtin: boolean;
  installed: boolean;
  source: "builtin" | "pack";
  /** Pack data (quiz banks, word lists, prompt packs) — built-ins have none. */
  data?: Record<string, unknown> | null;
}

export interface CataloguePackDef {
  id: string;
  engine: string;
  name: string;
  emoji: string;
  tagline: string;
  category: string;
  ages: string;
  howTo?: string;
  data: Record<string, unknown>;
}

export interface GameStepResult {
  state: Record<string, unknown>;
  reply?: string;
  needsLlm?: boolean;
  prompt?: string;
  wrap?: boolean;
}

export interface GameEngine {
  id: string;
  seed: (opts?: Record<string, unknown>) => Record<string, unknown>;
  step: (state: Record<string, unknown>, input: string) => GameStepResult;
  intro?: (state: Record<string, unknown>) => string;
  systemPrompt?: (state: Record<string, unknown>, game: unknown) => string;
  fallback?: (state: Record<string, unknown>, game?: unknown) => string;
  /** Resolve game-over from the model's own words (e.g. oracle "WIN:"). */
  parseLlmReply?: (state: Record<string, unknown>, reply: string) => Record<string, unknown> | null;
}

export declare const BUILTIN_GAMES: GameDef[];
export declare const ENGINES: Record<string, GameEngine | null>;
export declare const CATALOGUE: CataloguePackDef[];
export declare function getGame(id: string): GameDef | null;
export declare function listGames(): Promise<GameDef[]>;
export declare function getPlayableGame(id: string): Promise<(GameDef & { engineImpl: GameEngine | null }) | null>;
export declare function validatePack(pack: Partial<CataloguePackDef>): string[];
export declare function listInstalledPacks(): Promise<CataloguePackDef[]>;
export declare function installPack(id: string): Promise<{ ok: boolean; error?: string; pack?: CataloguePackDef }>;
export declare function uninstallPack(id: string): Promise<boolean>;
export declare function packEngine(pack: CataloguePackDef): GameEngine | null;
export declare function sanitizeGameState(state: unknown): unknown;
export declare function startGameSession(args: {
  gameId: string;
  chatId?: string;
  game: GameDef & { engineImpl: GameEngine | null };
  state: Record<string, unknown>;
}): {
  id: string;
  gameId: string;
  chatId: string | null;
  game: { id: string; name: string; emoji: string; needsLlm: boolean };
  engine: GameEngine;
  state: Record<string, unknown>;
  history: { role: "user" | "assistant"; content: string }[];
  touch(): void;
};
export declare function getGameSession(id: string): ReturnType<typeof startGameSession> | null;
export declare function endGameSession(id: string): boolean;
