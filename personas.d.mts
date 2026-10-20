export interface PersonaMemorySeed {
  content: string;
  importance: number;
}

export interface PersonaCard {
  id: string;
  name: string;
  tagline: string;
  description: string;
  traits: Record<string, string>;
  systemPrompt: string;
  greeting: string;
  memorySeeds: PersonaMemorySeed[];
  suggestedModel: string;
  version: string;
  author: string;
}

export declare const personas: Record<string, PersonaCard>;
export declare const DEFAULT_PERSONAS: string[];

export declare function listPersonas(): { id: string; name: string; tagline: string }[];
export declare function personaIds(): string[];
export declare function getPersona(id: string): PersonaCard;
