---
name: ui-ux-design
description: UI/UX patterns, documentation site conventions, and design system for Hybrid's documentation and mini apps. Use when working on the site, mini apps, or user-facing interfaces.
---

# UI/UX Design

Hybrid's documentation site and mini apps follow specific design patterns for consistency and accessibility.

## Documentation Site

Located in `site/` using Astro + React.

### Structure

```
site/
├── content/
│   └── docs/
│       ├── quickstart.md
│       ├── core-concepts.md
│       ├── using-hybrid.md
│       ├── developing/
│       │   └── contributing.md
│       ├── tools/
│       │   ├── index.md
│       │   ├── xmtp.md
│       │   └── blockchain.md
│       └── blockchain/
│           └── multi-chain.md
├── src/
│   ├── components/
│   ├──layouts/
│   └── pages/
└── astro.config.mjs
```

### Content Format

All documentation uses Markdown with frontmatter:

```markdown
---
title: Page Title
description: Short description for SEO
---

# Page Title

Content here...

## Section

More content...

### Subsection

Even more content...
```

### Code Blocks

Use fenced code blocks with language:

````markdown
```typescript
const client = await createXMTPClient(key)
```

```bash
hybrid deploy fly
```

```json
{
  "name": "hybrid"
}
```
````

### Admonitions

Use callouts for important information:

```markdown
:::note
This is a note.
:::

:::warning
This is a warning.
:::

:::tip
This is a tip.
:::

:::caution
This is a caution.
:::
```

---

## Mini App Design

Hybrid agents can serve mini apps for web-based interaction.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Mini App                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    React Components                      │    │
│  │  - Chat Interface                                        │    │
│  │  - Message List                                          │    │
│  │  - Input Field                                           │    │
│  │  - Loading States                                        │    │
│  └─────────────────────────────────────────────────────────┘    │
│                          │                                       │
│                          ▼                                       │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    API Client                            │    │
│  │  POST /api/chat → SSE stream                             │    │
│  │  GET /health → health check                              │    │
│  └─────────────────────────────────────────────────────────┘    │
│                          │                                       │
└──────────────────────────┼───────────────────────────────────────┘
                           │
                           ▼
              ┌──────────────────────────┐
              │     Agent Server (8454)   │
              └──────────────────────────┘
```

### Chat Interface Component

```typescript
import { useState, useRef, useEffect } from "react"

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
}

export function ChatInterface({ agentUrl }: { agentUrl: string }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: input,
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setInput("")
    setIsLoading(true)

    try {
      const response = await fetch(`${agentUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: messages.map(m => ({ id: m.id, role: m.role, content: m.content })),
          chatId: "default"
        })
      })

      const reader = response.body?.getReader()
      if (!reader) throw new Error("No reader")

      let assistantContent = ""
      const assistantId = crypto.randomUUID()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = new TextDecoder().decode(value)
        const lines = chunk.split("\n").filter(l => l.startsWith("data: "))

        for (const line of lines) {
          if (line === "data: [DONE]") continue
          const data = JSON.parse(line.slice(6))
          if (data.type === "text") {
            assistantContent += data.content
            setMessages(prev => {
              const updated = [...prev]
              const idx = updated.findIndex(m => m.id === assistantId)
              if (idx >= 0) {
                updated[idx] = { ...updated[idx], content: assistantContent }
              } else {
                updated.push({
                  id: assistantId,
                  role: "assistant",
                  content: assistantContent,
                  timestamp: new Date()
                })
              }
              return updated
            })
          }
        }
      }
    } catch (error) {
      console.error("Chat error:", error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="chat-container">
      <div className="messages">
        {messages.map(m => (
          <div key={m.id} className={`message ${m.role}`}>
            {m.content}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <div className="input-area">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && sendMessage()}
          placeholder="Type a message..."
          disabled={isLoading}
        />
        <button onClick={sendMessage} disabled={isLoading}>
          {isLoading ? "..." : "Send"}
        </button>
      </div>
    </div>
  )
}
```

---

## Accessibility

### Focus Management

```css
/* Visible focus rings */
:focus-visible {
  outline: 2px solid var(--focus-color);
  outline-offset: 2px;
}

/* Focus within for groups */
.input-group:focus-within {
  border-color: var(--focus-color);
}
```

### Keyboard Navigation

```typescript
// Handle Enter key
<input
  onKeyDown={e => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }}
/>

// Handle Escape to close
useEffect(() => {
  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      setIsOpen(false)
    }
  }
  window.addEventListener("keydown", handleEscape)
  return () => window.removeEventListener("keydown", handleEscape)
}, [])
```

### Screen Reader Support

```tsx
// Use semantic HTML
<button aria-label="Send message">
  <SendIcon aria-hidden="true" />
</button>

// Live regions for updates
<div aria-live="polite" aria-atomic="true">
  {status}
</div>

// Form labels
<label htmlFor="message-input">Message</label>
<input id="message-input" type="text" />
```

### Color Contrast

```css
/* Meet WCAG AA (4.5:1 for text) */
.text-primary {
  color: var(--text-primary);
  background: var(--bg-primary);
}

/* Increase on interactive states */
.button:hover {
  filter: brightness(1.1);
}

/* Don't rely on color alone */
.error {
  color: var(--error-color);
}

.error::before {
  content: "⚠ ";
}
```

---

## Loading States

### Skeleton Loading

```tsx
function MessageSkeleton() {
  return (
    <div className="message skeleton" aria-label="Loading message">
      <div className="skeleton-avatar" />
      <div className="skeleton-content">
        <div className="skeleton-line" style={{ width: "60%" }} />
        <div className="skeleton-line" style={{ width: "80%" }} />
        <div className="skeleton-line" style={{ width: "40%" }} />
      </div>
    </div>
  )
}

@keyframes skeleton-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.skeleton-line {
  animation: skeleton-pulse 1.5s ease-in-out infinite;
  background: var(--skeleton-bg);
  border-radius: 4px;
  height: 12px;
  margin-bottom: 8px;
}
```

### Streaming Indicator

```tsx
function StreamingIndicator() {
  return (
    <span className="streaming" aria-label="Agent is typing">
      <span className="dot" />
      <span className="dot" />
      <span className="dot" />
    </span>
  )
}

.streaming .dot {
  animation: dot-bounce 1.4s ease-in-out infinite;
}

.streaming .dot:nth-child(2) {
  animation-delay: 0.2s;
}

.streaming .dot:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes dot-bounce {
  0%, 80%, 100% { transform: scale(0); }
  40% { transform: scale(1); }
}
```

---

## Message Formatting

### Markdown Rendering

```tsx
import ReactMarkdown from "react-markdown"

function FormattedMessage({ content }: { content: string }) {
  return (
    <ReactMarkdown
      components={{
        code: CodeBlock,
        a: ExternalLink,
        ul: BulletList,
        ol: NumberedList
      }}
    >
      {content}
    </ReactMarkdown>
  )
}

function CodeBlock({ inline, className, children }: CodeProps) {
  const language = className?.replace(/language-/, "") || "text"
  
  if (inline) {
    return <code className="inline-code">{children}</code>
  }
  
  return (
    <div className="code-block">
      <div className="code-header">
        <span>{language}</span>
        <CopyButton text={String(children)} />
      </div>
      <pre><code>{children}</code></pre>
    </div>
  )
}
```

### Platform Formatting

```tsx
// Discord/WhatsApp: No markdown tables, use bullet lists
function formatForPlatform(content: string, platform: "discord" | "slack" | "whatsapp"): string {
  switch (platform) {
    case "discord":
      return content
        .replace(/\|.*\|/g, m => `• ${m.replace(/\|/g, "").trim()}`) // Tables to bullets
        .replace(/^#+ /gm, "**") // Headers to bold
    case "whatsapp":
      return content
        .replace(/```/g, "") // Remove code blocks
        .replace(/^#+ /gm, "") // Remove headers
        .replace(/\*\*/g, "*") // Bold
    default:
      return content
  }
}

// Discord: Wrap links in <> to suppress embeds
function formatDiscordLinks(content: string): string {
  return content.replace(/(https?:\/\/[^\s]+)/g, "<$1>")
}
```

---

## Error Handling UI

### Error Boundary

```tsx
class ChatErrorBoundary extends React.Component {
  state = { hasError: false, error: null }
  
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }
  
  render() {
    if (this.state.hasError) {
      return (
        <div className="error-container">
          <h2>Something went wrong</h2>
          <p>{this.state.error.message}</p>
          <button onClick={() => this.setState({ hasError: false })}>
            Try again
          </button>
        </div>
      )
    }
    
    return this.props.children
  }
}
```

### Inline Errors

```tsx
function ErrorMessage({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-message" role="alert">
      <span className="error-icon">⚠️</span>
      <span className="error-text">{message}</span>
      {onRetry && (
        <button className="retry-button" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  )
}
```

---

## Responsive Design

### Mobile-First

```css
/* Base: Mobile */
.chat-container {
  padding: 16px;
  max-width: 100%;
}

/* Tablet */
@media (min-width: 768px) {
  .chat-container {
    padding: 24px;
    max-width: 600px;
    margin: 0 auto;
  }
}

/* Desktop */
@media (min-width: 1024px) {
  .chat-container {
    padding: 32px;
    max-width: 800px;
  }
}
```

### Touch Targets

```css
/* Minimum 44x44px for mobile */
.button,
.input,
.icon-button {
  min-height: 44px;
  min-width: 44px;
}

/* Expand visual size if needed */
.small-button {
  height: 32px; /* Visual size */
  padding: 6px; /* Expands to 44px touch target */
}
```

### Safe Areas

```css
/* Respect notch and home indicator */
.chat-input {
  padding-bottom: env(safe-area-inset-bottom);
}

.chat-header {
  padding-top: env(safe-area-inset-top);
}
```

---

## Dark Mode

### CSS Variables

```css
:root {
  --bg-primary: #ffffff;
  --bg-secondary: #f5f5f5;
  --text-primary: #1a1a1a;
  --text-secondary: #666666;
  --border: #e5e5e5;
  --focus: #0066ff;
  --error: #ff3333;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg-primary: #1a1a1a;
    --bg-secondary: #262626;
    --text-primary: #ffffff;
    --text-secondary: #a3a3a3;
    --border: #404040;
  }
}
```

### Toggle Control

```tsx
function useDarkMode() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === "undefined") return false
    return window.matchMedia("(prefers-color-scheme: dark)").matches
  })
  
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches)
    media.addEventListener("change", handler)
    return () => media.removeEventListener("change", handler)
  }, [])
  
  return isDark
}
```

---

## Animation Guidelines

### Timing

```css
/* Fast: Hover states */
.button:hover {
  transition: background-color 0.15s ease;
}

/* Medium: Expand/collapse */
.panel {
  transition: height 0.3s ease;
}

/* Slow: Page transitions */
.page {
  transition: opacity 0.5s ease;
}
```

### Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

### Compositor Properties

```css
/* Good: Transform and opacity */
.animated {
  transform: translateX(0);
  opacity: 1;
  transition: transform 0.3s ease, opacity 0.3s ease;
}

/* Bad: Layout properties */
.avoid {
  width: 100px;
  height: 100px;
  transition: width 0.3s ease; /* Causes reflow */
}
```

---

## Iconography

### Icon Sizing

```css
.icon {
  /* Small inline icons */
  &.sm { width: 16px; height: 16px; }
  
  /* Default */
  &.md { width: 20px; height: 20px; }
  
  /* Large feature icons */
  &.lg { width: 24px; height: 24px; }
  
  /* Hero icons */
  &.xl { width: 32px; height: 32px; }
}
```

### Icon Accessibility

```tsx
// Decorative icons
<SendIcon aria-hidden="true" />

// Meaningful icons
<button aria-label="Send message">
  <SendIcon aria-hidden="true" />
</button>

// Standalone meaningful icons
<WarningIcon aria-label="Warning" role="img" />
```

---

## Copy Button

```tsx
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  
  return (
    <button
      onClick={handleCopy}
      aria-label={copied ? "Copied" : "Copy to clipboard"}
      className="copy-button"
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  )
}
```

---

## Form Validation

### Inline Validation

```tsx
function Input({ value, onChange, validate }: InputProps) {
  const [error, setError] = useState<string>()
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    const validationError = validate?.(newValue)
    setError(validationError)
    onChange(newValue)
  }
  
  return (
    <div className="input-container">
      <input
        value={value}
        onChange={handleChange}
        aria-invalid={!!error}
        aria-describedby={error ? "error-message" : undefined}
      />
      {error && (
        <p id="error-message" className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
```

### Submit Button State

```tsx
function SubmitButton({ isLoading, disabled }: ButtonProps) {
  return (
    <button
      type="submit"
      disabled={disabled || isLoading}
      aria-busy={isLoading}
    >
      {isLoading ? (
        <>
          <Spinner aria-hidden="true" />
          <span>Sending...</span>
        </>
      ) : (
        "Send"
      )}
    </button>
  )
}
```