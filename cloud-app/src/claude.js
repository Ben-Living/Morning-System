const Anthropic = require('@anthropic-ai/sdk');
const { DateTime } = require('luxon');

const NZ_TZ = 'Pacific/Auckland';
const MODEL = 'claude-sonnet-4-6';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── System Prompt ────────────────────────────────────────────────────────────
// Update this every 1-2 weeks as Ben's developmental intention evolves.

const SYSTEM_PROMPT = `You are Ben McAlister's morning check-in companion, synthesiser, and accountability partner.

## About Ben

Ben is a practitioner of regenerative development and cohousing based in New Zealand. His work sits at the intersection of community building, ecological design, and human development. He thinks deeply, cares about getting things right, and holds himself to high standards.

Ben is an Enneagram Type 1 — the Principled Reformer. He has a strong inner critic, a drive toward integrity, and a tendency to notice what is wrong or imperfect before what is right. He is doing active developmental work around softening his relationship with his inner critic and learning to inhabit his own worthiness more fully.

**Current heart-wish:** "I want to not be wrong."

This is not merely intellectual — it touches something deep about safety, belonging, and self-trust. Hold this lightly in awareness.

## Your Role

You show up as warm, perceptive, practically oriented, and gently challenging when needed. You do not perform wellness-speak. You meet Ben where he is.

**In the morning check-in:**
- Open with a short, grounded question that invites Ben into the day (not generic — let it be informed by what you know about his context)
- Listen for what's alive, what's heavy, what's exciting
- Help him name his top priorities for the day — not a long list, but what really matters
- Notice when his Type 1 patterns are running (self-criticism, trying to do it all perfectly, anxiety about being wrong) and name this warmly when useful
- Surface anything from his calendar or emails that deserves his attention
- Ask about tracked items that have appeared in previous sessions without resolution
- If he says "just tell me what's on top today", offer a concise, grounded minimal check-in — no need to go through everything

**In the dashboard:**
- Synthesise the check-in into a clean daily dashboard
- Sections: Today's Priorities, What's Coming Up (calendar), Email Attention Needed, Active Note, Open Loops & Tracked Items
- Tone: clear, honest, anchoring — like a well-organised desk before a day's work

**In the evening review:**
- Invite reflection on what actually happened vs. what was intended
- Ask what felt good, what felt hard, what is being carried forward
- Note any items that should be tracked forward to tomorrow
- Generate a concise summary that will be injected into tomorrow's morning context
- Be warm and non-judgmental — the point is integration, not performance review

## Accountability

When something appears as an unresolved tracked item across multiple sessions, name it directly but without pressure. Ben is the one who knows what's actually going on. Your job is to make sure he can see what's been sitting there.

## Tone & Style

- Warm but not sycophantic
- Direct but not blunt
- Curious rather than prescriptive
- Trust Ben's capacity to know what he needs
- Short responses are often better than long ones — check in before elaborating
- Use plain language; avoid jargon
- You are allowed to gently push back when something seems off

## Context

You will receive a context block at the start of each session. Use it to personalise your responses. Don't read every item aloud back to Ben — let the context inform your awareness, not your recitation.`;

// ─── Context Builder ──────────────────────────────────────────────────────────

function buildContextBlock({ dateStr, events, emails, snapshot, trackedItems, previousSummary }) {
  const now = DateTime.now().setZone(NZ_TZ);
  const lines = [];

  lines.push(`## Session Context`);
  lines.push(`**Date:** ${dateStr} (NZ time)`);
  lines.push(`**Current time:** ${now.toFormat('h:mm a, cccc d MMMM yyyy')}`);
  lines.push('');

  // Previous session summary
  if (previousSummary) {
    lines.push('### From Yesterday');
    lines.push(previousSummary);
    lines.push('');
  }

  // Calendar events
  if (events && events.length > 0) {
    lines.push('### Today\'s Calendar');
    events.forEach((e) => {
      const time = e.isAllDay ? '(all day)' : e.startFormatted;
      lines.push(`- ${time}: **${e.summary}**${e.location ? ` @ ${e.location}` : ''}`);
    });
    lines.push('');
  } else {
    lines.push('### Today\'s Calendar');
    lines.push('No events found (or calendar not connected).');
    lines.push('');
  }

  // Emails
  if (emails && emails.length > 0) {
    lines.push('### Unread Emails (last 24h)');
    emails.slice(0, 10).forEach((e) => {
      lines.push(`- **${e.from}**: "${e.subject}" — ${e.snippet.slice(0, 100)}`);
    });
    if (emails.length > 10) {
      lines.push(`  _(+ ${emails.length - 10} more)_`);
    }
    lines.push('');
  } else {
    lines.push('### Unread Emails');
    lines.push('No unread emails (or Gmail not connected).');
    lines.push('');
  }

  // Notes & Reminders from Mac agent
  if (snapshot) {
    const snapshotAge = DateTime.now().diff(
      DateTime.fromSQL(snapshot.received_at, { zone: 'utc' }),
      'hours'
    ).hours;

    if (snapshotAge > 2) {
      lines.push(`> ⚠️ Notes/Reminders snapshot is ${Math.round(snapshotAge)} hours old — Mac agent may not be running.`);
      lines.push('');
    }

    if (snapshot.active_note) {
      lines.push('### Active Note');
      lines.push(snapshot.active_note.slice(0, 1000));
      lines.push('');
    }

    let reminders = [];
    try {
      reminders = JSON.parse(snapshot.reminders || '[]');
    } catch {}

    if (reminders.length > 0) {
      lines.push('### Incomplete Reminders');
      reminders.slice(0, 20).forEach((r) => {
        const due = r.dueDate ? ` (due ${r.dueDate})` : '';
        lines.push(`- ${r.name}${due}`);
      });
      lines.push('');
    }

    let notes = [];
    try {
      notes = JSON.parse(snapshot.notes || '[]');
    } catch {}

    if (notes.length > 0) {
      lines.push('### Recent Notes');
      notes.slice(0, 10).forEach((n) => {
        const title = n.title || n.name;
        const body = n.body ? n.body.trim().slice(0, 200) : '';
        lines.push(`- **${title}**${body ? `: ${body}` : ''}`);
      });
      lines.push('');
    }
  } else {
    lines.push('### Notes & Reminders');
    lines.push('No snapshot available from Mac agent.');
    lines.push('');
  }

  // Tracked items
  if (trackedItems && trackedItems.length > 0) {
    lines.push('### Open Tracked Items');
    trackedItems.forEach((item) => {
      const days = Math.round(
        DateTime.fromISO(dateStr).diff(DateTime.fromISO(item.first_seen), 'days').days
      );
      lines.push(`- ${item.description} _(open for ${days} day${days !== 1 ? 's' : ''})_`);
    });
    lines.push('');
  }

  return lines.join('\n');
}

// ─── Streaming Chat ────────────────────────────────────────────────────────────

async function* streamChat({ messages, contextBlock }) {
  // Prepend context as a system-level user turn
  const fullMessages = [
    { role: 'user', content: `<context>\n${contextBlock}\n</context>\n\nGood morning.` },
    { role: 'assistant', content: "Good morning, Ben. Let me take a moment with your context..." },
    ...messages,
  ];

  // If there are no real messages yet (fresh session), just start fresh
  // The context injection is always sent
  const messagesToSend = messages.length > 0
    ? [
        { role: 'user', content: `<context>\n${contextBlock}\n</context>` },
        ...messages,
      ]
    : [{ role: 'user', content: `<context>\n${contextBlock}\n</context>\n\nPlease open the morning check-in.` }];

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: messagesToSend,
  });

  for await (const chunk of stream) {
    if (
      chunk.type === 'content_block_delta' &&
      chunk.delta.type === 'text_delta'
    ) {
      yield chunk.delta.text;
    }
  }
}

// ─── Dashboard Generation ─────────────────────────────────────────────────────

async function generateDashboard({ conversationMessages, contextBlock }) {
  const prompt = `Based on our morning check-in conversation and the context provided, please generate today's dashboard.

Format it as clean markdown with these sections:
## Today's Priorities
(The 2-4 things that actually matter today, in order of importance)

## Coming Up Today
(Calendar events, formatted clearly)

## Emails Needing Attention
(Only the ones that actually need a response or action — skip FYIs)

## Active Note
(Key content from the Active note, if present)

## Open Loops & Tracked Items
(Things that are sitting unresolved — surfaced without pressure)

## One Thing to Remember
(A single grounding thought, insight, or intention from our conversation)

Be concise. This dashboard should be scannable in 30 seconds.`;

  const messagesToSend = [
    { role: 'user', content: `<context>\n${contextBlock}\n</context>` },
    ...conversationMessages,
    { role: 'user', content: prompt },
  ];

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    messages: messagesToSend,
  });

  return response.content[0].text;
}

// ─── Evening Review Generation ────────────────────────────────────────────────

async function* streamEveningReview({ conversationMessages, contextBlock, morningMessages }) {
  const openingPrompt = `It's evening now. Let's do a brief review of the day.

Looking back at what came up in our morning check-in${morningMessages.length > 0 ? ' and what was on your plate' : ''}, I'd love to hear:

- What actually happened today?
- What felt good or went well?
- What felt hard or didn't get done?
- What are you carrying forward to tomorrow?

Take your time. This is for integration, not performance review.`;

  const messagesToSend = [
    { role: 'user', content: `<context>\n${contextBlock}\n</context>` },
    ...(morningMessages.length > 0 ? [
      { role: 'user', content: '(Earlier this morning we had a check-in. Here\'s what came up:)' },
      ...morningMessages,
    ] : []),
    ...conversationMessages,
    ...(conversationMessages.length === 0 ? [{ role: 'user', content: openingPrompt }] : []),
  ];

  const finalMessages = conversationMessages.length === 0
    ? [
        { role: 'user', content: `<context>\n${contextBlock}\n</context>${morningMessages.length > 0 ? '\n\n(We had a morning check-in today.)' : ''}` },
      ]
    : messagesToSend;

  // If evening review is just starting, send the opening
  const streamMessages = conversationMessages.length === 0
    ? [{ role: 'user', content: `<context>\n${contextBlock}\n</context>\n\n${openingPrompt}` }]
    : messagesToSend;

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: streamMessages,
  });

  for await (const chunk of stream) {
    if (
      chunk.type === 'content_block_delta' &&
      chunk.delta.type === 'text_delta'
    ) {
      yield chunk.delta.text;
    }
  }
}

// ─── End-of-Day Summary ───────────────────────────────────────────────────────

async function generateDaySummary({ allMessages, contextBlock, dateStr }) {
  const prompt = `Please generate a concise end-of-day summary for ${dateStr}. This will be injected into tomorrow's morning context.

Include:
- What Ben focused on / what happened today
- Key insights or decisions from our conversations
- What was completed vs. deferred
- Anything important to carry forward
- Any emotional or developmental themes that were alive

Keep it under 300 words. Write it as if briefing tomorrow's version of yourself.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 400,
    system: SYSTEM_PROMPT,
    messages: [
      { role: 'user', content: `<context>\n${contextBlock}\n</context>` },
      ...allMessages,
      { role: 'user', content: prompt },
    ],
  });

  return response.content[0].text;
}

module.exports = {
  buildContextBlock,
  streamChat,
  generateDashboard,
  streamEveningReview,
  generateDaySummary,
};
