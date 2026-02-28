import type { Scheduler } from "./schedule"
import type { XmtpClient, XmtpConversation, XmtpMessage } from "./xmtp"

export interface AgentRuntime {
	conversation: XmtpConversation
	message: XmtpMessage
	xmtpClient: XmtpClient
	scheduler?: Scheduler
}
