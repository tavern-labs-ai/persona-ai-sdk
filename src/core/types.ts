import type {
  ConversationMessage,
  ExtractedMemoryCandidate,
  MemoryKind,
  MemoryRecord,
  MemoryScope,
  MemoryStatus,
  MemoryVisibility,
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
  readonly model: string;
  readonly dimensions: number | undefined;
  embed(texts: readonly string[]): Promise<readonly (readonly number[])[]>;
}

export interface MemoryFilters {
  characterId?: string;
  userId?: string | null;
  conversationId?: string;
  branchId?: string | null;
  branchIds?: readonly (string | null)[];
  scopes?: readonly MemoryScope[];
  kinds?: readonly MemoryKind[];
  statuses?: readonly MemoryStatus[];
  visibilities?: readonly MemoryVisibility[];
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
  branchId?: string | null;
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
  superseded: readonly MemoryRecord[];
  conflicts: readonly MemoryConflict[];
}

export interface RecallInput {
  characterId: string;
  userId?: string | null;
  conversationId?: string;
  branchId?: string | null;
  viewerCharacterId?: string;
  includeSecrets?: boolean;
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
  consolidation?: MemoryConsolidationPolicy;
  onEvent?: (event: MemoryRuntimeEvent) => void | Promise<void>;
}

export type MemoryRuntimeEvent =
  | { type: "ingest.completed"; characterId: string; conversationId: string; result: IngestResult }
  | { type: "recall.completed"; characterId: string; query: string; result: RecallResult };

export type ConsolidationAction = "merge" | "supersede" | "keep" | "conflict";

export interface ConsolidationDecision {
  action: ConsolidationAction;
  existingId?: string;
  reason: string;
  similarity?: number;
}

export interface MemoryConsolidationPolicy {
  decide(
    candidate: MemoryRecord,
    existing: readonly MemoryRecord[],
  ): Promise<ConsolidationDecision> | ConsolidationDecision;
}

export interface MemoryConflict {
  candidate: MemoryRecord;
  existing: MemoryRecord;
  reason: string;
}

export interface MemoryExport {
  format: "character-memory-runtime";
  version: 1;
  exportedAt: string;
  records: readonly MemoryRecord[];
}

export interface MemoryImportResult {
  imported: number;
  skipped: number;
}

export interface ReembedResult {
  updated: number;
  provider: string;
  model: string;
}

export interface MemoryCompactor {
  compact(memories: readonly MemoryRecord[]): Promise<string> | string;
}

export interface CompactInput extends MemoryFilters {
  compactor: MemoryCompactor;
  minimumRecords?: number;
  archiveSources?: boolean;
}

export interface CompactResult {
  storyArc: MemoryRecord | null;
  archived: number;
}

export interface ForkBranchInput extends MemoryFilters {
  toBranchId: string;
}
