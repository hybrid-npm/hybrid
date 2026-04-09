# @hybrd/channels

Channel adapter framework for Hybrid agents.

> **Note:** This package is being rewritten to use `chat-sdk`. The previous adapter implementation has been removed.

## Overview

Provides types and dispatch infrastructure for sending messages through different channels (Slack, Discord, Telegram, etc.).

- **dispatchToChannel()** — Send a message to a user via any registered channel adapter
- **ChannelAdapter interface** — Pluggable adapter pattern for new messaging platforms

## Usage

```typescript
import { dispatchToChannel } from "@hybrd/channels"

const result = await dispatchToChannel({
  channel: "slack",
  to: "channel-id",
  message: "Hello from the scheduler!"
})
```

## License

MIT
