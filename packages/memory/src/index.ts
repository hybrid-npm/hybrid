export { MemoryIndexManager } from "./manager.js"
export { listMemoryFiles, chunkMarkdown, hashText } from "./internal.js"
export type {
	MemorySearchManager,
	MemorySearchResult,
	MemoryProviderStatus,
	MemorySource,
	MemoryScope,
	MemoryEmbeddingProbeResult,
	MemorySyncProgressUpdate,
	ResolvedMemoryConfig,
	MemoryIndexManagerOptions
} from "./types.js"
export type { EmbeddingProvider } from "./providers/types.js"
export { createEmbeddingProvider } from "./providers/index.js"
export {
	createMemoryWatcher,
	closeWatcher,
	createWatcherHandle,
	type WatcherHandle
} from "./watcher.js"
export {
	saveConversation,
	loadConversation,
	listConversations,
	normalizeConversationText,
	extractConversationContent,
	conversationToMemoryChunks,
	buildConversationEntry,
	conversationPathForFile,
	listConversationFiles,
	type ConversationEntry,
	type ConversationMessage
} from "./conversations.js"
export {
	resolveMemoryConfig,
	getDefaultMemoryConfig,
	type MemoryConfigInput
} from "./config.js"
export {
	appendToMemory,
	readMemorySection,
	clearMemorySection,
	type MemoryCategory,
	type AutoMemoryEntry
} from "./auto-memory.js"
export {
	isValidWalletAddress,
	normalizeWalletAddress,
	validateWalletAddress
} from "./validate.js"
export {
	getProjectHash,
	getOpenClawMemoryPath,
	getUserMemoryPath,
	getProjectMemoryPath,
	getMemoryPaths,
	type MemoryPaths
} from "./paths.js"
export {
	parseACL,
	getRole,
	addOwner,
	removeOwner,
	listOwners,
	type Role,
	type ACL
} from "./acl.js"
