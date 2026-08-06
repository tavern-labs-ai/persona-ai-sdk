import type {
  ConversationMessage,
  ExtractedMemoryCandidate,
  MemoryKind,
  MemoryRecord,
  MemoryScope,
  MemoryStatus,
  MessageRole,
} from "./schema.js";

export interface MemoryExtractionInput {
  characterId: string;
  userId: string | null;
  conversationId: string;
  messages: readonly ConversationMessage[];
}

export interface MemoryExtractor {
  readonly provider: string;
  extract(input: MemoryExtractionInput): Promise<readonly ExtractedMemoryCandidate[]>;
}

export interface EmbeddingProvider {
  readonly provider: string;
  readonly dimensions: number | undefined;
  embed(texts: readonly string[]): Promise<readonly (readonly number[])[]>;
}

export interface MemoryFilters {
  characterId?: string;
  userId?: string | null;
  conversationId?: string;
  scopes?: readonly MemoryScope[];
  kinds?: readonly MemoryKind[];
  statuses?: readonly MemoryStatus[];
}

export interface MemorySearchQuery extends MemoryFilters {
  text: string;
  embedding?: readonly number[];
  limit?: number;
  now?: Date;
}

export interface MemoryScoreComponents {
  semantic: number;
  lexical: number;
  importance: number;
  recency: number;
}

export interface MemorySearchResult {
  memory: MemoryRecord;
  score: number;
  components: MemoryScoreComponents;
}

export interface MemoryStore {
  readonly kind: string;
  upsert(memory: MemoryRecord): Promise<void>;
  upsertMany(memories: readonly MemoryRecord[]): Promise<void>;
  get(id: string): Promise<MemoryRecord | null>;
  delete(id: string): Promise<boolean>;
  list(filters?: MemoryFilters): Promise<readonly MemoryRecord[]>;
  search(query: MemorySearchQuery): Promise<readonly MemorySearchResult[]>;
}

export interface IngestInput {
  characterId: string;
  userId?: string | null;
  conversationId: string;
  messages: readonly IngestMessage[];
}

export interface IngestMessage {
  id: string;
  role: MessageRole;
  content: string;
  name?: string | null;
  timestamp?: string | null;
  characterId?: string | null;
}

export interface IngestResult {
  created: readonly MemoryRecord[];
  merged: readonly MemoryRecord[];
}

export interface RecallInput {
  characterId: string;
  userId?: string | null;
  conversationId?: string;
  query: string;
  scopes?: readonly MemoryScope[];
  kinds?: readonly MemoryKind[];
  limit?: number;
  tokenBudget?: number;
}

export interface RecallResult {
  memories: readonly MemorySearchResult[];
  context: string;
  estimatedTokens: number;
}

export interface CharacterMemoryRuntimeOptions {
  extractor: MemoryExtractor;
  store: MemoryStore;
  embeddings?: EmbeddingProvider;
  now?: () => Date;
  createId?: () => string;
  minimumConfidence?: number;
}
