# TOOLS.md - Local Notes

Skills define *how* tools work. This file is for *your* specifics — the stuff that's unique to your setup.

## What Goes Here

Things like:

* Camera names and locations
* SSH hosts and aliases
* Preferred voices for TTS
* Speaker/room names
* Device nicknames
* Anything environment-specific

## Examples

```markdown
### Cameras

- living-room → Main area, 180° wide angle
- front-door → Entrance, motion-triggered

### SSH

- home-server → 192.168.1.100, user: admin

### TTS

- Preferred voice: "Nova" (warm, slightly British)
- Default speaker: Kitchen HomePod
```

## Why Separate?

Skills are shared. Your setup is yours. Keeping them apart means you can update skills without losing your notes, and share skills without leaking your infrastructure.

## WebFetch vs agent-browser

When you need to interact with URLs, pick the right tool:

### Use WebFetch when:
- Quick static content retrieval (APIs, simple HTML pages)
- Fetching JSON or raw data
- No interaction needed with the page

### Use agent-browser when:
- Navigating to a URL with `agent-browser open <url>`
- Clicking buttons, filling forms
- Sites that require JavaScript to render
- Taking screenshots
- Login/authentication flows
- Testing web apps
- Any interactive browser task

### Triggers for agent-browser:
- "open", "go to", "visit" → browser
- "click", "fill", "submit", "login" → browser
- "screenshot", "take a picture of" → browser
- "test", "interact with", "automate" → browser

If unsure and the task involves a URL, ask which method they prefer.

***

Add whatever helps you do your job. This is your cheat sheet.