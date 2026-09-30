export interface BotDef {
  id: string;
  name: string;
  emoji: string;
  tagline: string;
  builtin?: boolean;
  systemPrompt: string;
  createdAt?: number;
}

export interface BuiltPrompt {
  system?: string;
  user: string;
}

export interface SkillDef {
  id: string;
  name: string;
  emoji: string;
  icon: string;
  description: string;
  inputHint: string;
  build: (args: { text?: string; context?: string }) => BuiltPrompt;
}

export declare const BUILTIN_BOTS: BotDef[];
export declare const BUILTIN_SKILLS: SkillDef[];
export declare function getBot(id: string): BotDef | null;
export declare function getSkill(id: string): SkillDef | null;
export declare function listUserBots(): Promise<BotDef[]>;
export declare function saveBot(bot: Partial<BotDef>): Promise<BotDef>;
export declare function deleteBot(id: string): Promise<boolean>;
