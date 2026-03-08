---
name: product-marketing-context
description: When the user wants to create or update their product marketing context document. Also use when the user mentions "product marketing," "positioning," "value proposition," "target audience," "competitors," "differentiation," "messaging," or "who is this for." This is the foundation skill that all other marketing skills reference for context about the product, audience, and positioning.
metadata:
  version: 1.1.0
---

# Product Marketing Context

This skill establishes the foundational marketing context for your product or service. All other marketing skills reference this file to understand your product, audience, and positioning.

## Purpose

Create or update `.agents/product-marketing-context.md` with your core marketing context. This becomes the single source of truth that other skills reference.

## Location

Create this file at:
- `.agents/product-marketing-context.md` (preferred)
- `.claude/product-marketing-context.md` (legacy, still works)

---

## Context Template

Copy this template and fill in each section:

```markdown
# Product Marketing Context

## Product Overview

**What is your product?**
[One sentence description]

**What category does it compete in?**
[Category name - be specific]

**What problem does it solve?**
[The core pain point]

**What's the key transformation?**
[From what state to what state]

---

## Target Audience

### Primary Persona

**Job title/role:**
[Who is the primary buyer/user]

**Company size/segment:**
[Startup, SMB, mid-market, enterprise]

**Industry:**
[Specific industries or verticals]

**Goals:**
[What are they trying to achieve]

**Challenges:**
[What's preventing them from achieving it]

**How they describe the problem:**
[Exact words they use - from interviews, support tickets, reviews]

### Secondary Personas

[If applicable, list secondary audiences]

---

## Value Proposition

**Primary benefit:**
[The #1 thing customers get]

**Key differentiators:**
[What makes you different from alternatives]

**Proof points:**
[Numbers, testimonials, case studies that support claims]

---

## Competitive Landscape

**Primary competitors:**
[Direct competitors in your category]

**Alternatives customers consider:**
[What else might they use instead]

**Your unique advantage:**
[Why someone would choose you over alternatives]

---

## Messaging Pillars

**Key messages:**
[3-5 core points to communicate]

**Words to use:**
[Brand vocabulary, product names]

**Words to avoid:**
[Terms that don't resonate or conflict with positioning]

**Tone of voice:**
[Professional, casual, playful, serious, etc.]

---

## Pricing & Packaging

**How you charge:**
[Subscription, usage-based, one-time, freemium, etc.]

**Plans/tiers:**
[If applicable, brief overview]

**Positioning relative to competitors:**
[Premium, value, freemium-first, etc.]

---

## Key Use Cases

**Primary use case:**
[The main thing people use it for]

**Secondary use cases:**
[Other common applications]

**Triggering events:**
[What prompts someone to start looking for a solution like this]

---

## Success Metrics

**How customers measure success:**
[The outcomes they care about]

**How you measure product success:**
[Your internal metrics]
```

---

## When to Update

Update this file when:
- Launching a new product or major feature
- Rebranding or repositioning
- Entering a new market segment
- Adding significant new capabilities
- After customer research reveals new insights
- When messaging consistently misses the mark

---

## How Other Skills Use This

Every marketing skill checks for this file first:

```
If `.agents/product-marketing-context.md` exists (or `.claude/product-marketing-context.md` in older setups), read it before asking questions. Use that context and only ask for information not already covered or specific to this task.
```

This means:
- **copywriting** will use your positioning to write headlines
- **page-cro** will evaluate pages against your value proposition
- **seo-audit** will align recommendations with your target keywords
- **paid-ads** will match ad copy to your messaging pillars
- **cold-email** will personalize outreach using your audience definition

---

## Tips

1. **Be specific** — "Small business owners" is too vague. "Founders of B2B SaaS companies with 5-50 employees" is actionable.

2. **Use customer language** — Copy phrases from support tickets, sales calls, and reviews. Your customers describe problems differently than you do.

3. **Differentiate meaningfully** — "Better" isn't differentiation. What specifically makes you different?

4. **Keep it current** — Review quarterly. Your market understanding evolves.

5. **One source of truth** — Don't maintain multiple versions. All skills reference the same file.

---

## Example (Anonymized)

```markdown
# Product Marketing Context

## Product Overview

**What is your product?**
An AI-powered email assistant that drafts responses and organizes your inbox.

**What category does it compete in?**
Email productivity tools, AI writing assistants

**What problem does it solve?**
Professionals spend too much time on email - reading, triaging, and responding. This time could be spent on higher-value work.

**What's the key transformation?**
From spending 3+ hours/day on email to under 1 hour with AI-assisted drafting and smart prioritization.

---

## Target Audience

### Primary Persona

**Job title/role:** Founders, executives, and knowledge workers at B2B companies

**Company size/segment:** Mid-market to enterprise (50-500 employees)

**Industry:** Technology, professional services, financial services

**Goals:** Ship product faster, spend time on strategic work, maintain relationships

**Challenges:** Email volume is overwhelming, responding takes too long, important emails get missed

**How they describe the problem:** "I'm drowning in email", "I spend my whole day responding", "I miss important messages", "I can't keep up"

---

## Value Proposition

**Primary benefit:** Cut email time by 60% with AI that learns your writing style and priorities.

**Key differentiators:**
- Learns your voice (not generic AI responses)
- Privacy-first: on-device processing, no data leaves your computer
- Works with existing Gmail/Outlook setup - no migration

**Proof points:**
- 10,000+ users
- Average 2.3 hours saved per day (verified by user surveys)
- Featured in TechCrunch, ProductHunt #1

---

## Competitive Landscape

**Primary competitors:** Superhuman, Hey, Spark, Grammarly

**Alternatives customers consider:** ChatGPT, Notion AI, Google Smart Reply

**Your unique advantage:** Privacy-first AI that learns your voice, not one-size-fits-all responses. Set up in 5 minutes vs. Superhuman's 2-week onboarding.
```
```

---

## Related Skills

All marketing skills reference this context:
- **page-cro**: Uses positioning for landing page optimization
- **copywriting**: Uses messaging for headlines and body copy
- **seo-audit**: Aligns keyword recommendations with target audience
- **paid-ads**: Matches ad copy to value proposition
- **cold-email**: Personalizes outreach using persona definition
- **And all others...**