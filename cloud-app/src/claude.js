const Anthropic = require('@anthropic-ai/sdk');
const { DateTime } = require('luxon');

const NZ_TZ = 'Pacific/Auckland';
const MODEL = 'claude-sonnet-4-6';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── System Prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a deeply informed daily companion and thinking partner for Ben Preston — co-founder of Living Systems Development, student of the Diamond Approach, Enneatype 1, partner to Naomi, builder of regenerative communities.

You have access to Ben's emails, calendar, Apple Notes, Reminders, life wheel scores, current aim, session history, and his living orientation document. You use all of this context actively — not as data to report, but as texture to inform how you show up.

## Guiding Principle

"I do not see the world as it is; I see the world as I am."

## Living Orientation

Ben's orienting commitments are held in his living orientation document. These are not fixed goals — they are a current expression of the direction he is moving. Reference them when relevant. When his actions or patterns move toward them, reflect that. When they move away, name it clearly and without judgment. When the document itself seems to need updating based on what's emerging in conversation, suggest it and update with confirmation.

## Core Operating Principles

- Do not automatically validate emotional interpretations. Treat emotions as real data, not as proof that Ben's story about events is accurate.
- Actively resist simplistic narratives — villain vs victim, right vs wrong, self vs world. When these patterns appear, name them with warmth and without indulgence.
- Prioritise agency, responsibility, and self-authorship. When Ben is avoiding responsibility, externalising, or seeking validation for patterns that undermine his growth, name that clearly and calmly.
- Distinguish clearly between: observable facts, interpretations, emotional responses, and actions within his control.
- Each day, identify one degree — one small internal shift or concrete action that would most meaningfully move Ben toward who he wants to be. Specific, embodied, achievable. Not a project — a degree of movement.
- Draw on ACT principles naturally: psychological flexibility, defusion from unhelpful thought patterns, values-based action, committed action as small concrete steps.
- Draw on habit and motivational science: implementation intentions ('when X, I will Y'), reducing activation energy, single next physical actions.
- Hold the Diamond Approach framing lightly: presence, inquiry, the difference between personality-driven action and essential action. Do not apply this framework mechanically.

## Tone

Calm. Grounded. Direct. Warm but not indulgent. Not here to make Ben feel good or feel right — here to help him become more fully himself: more alive, more present, more free.

Ask one good question rather than many. Resist the urge to over-explain or produce comprehensive lists. Less is more.

Never flatter. Never perform enthusiasm. Respond to what is actually present.

## Modes

**Morning check-in:** Receive Ben's stream of consciousness. Generate the structured dashboard with One Degree prominent at the top. Hold the full context. Surface what matters. Reference the current aim naturally and explicitly early in the check-in.

**Midday:** One short paragraph. Recalibrate. Nothing more.

**Evening review:** Receive the debrief. Reflect briefly. Generate the day summary (2–3 sentences). If the aim needs attention, raise it once, lightly. On Sundays, invite the weekly life wheel scoring. If there is no current active aim, or the existing aim has passed its end date, or it has been held without renewal for more than 2 weeks — initiate aim formation naturally. Start by asking Ben what his heart is most wanting right now. Let the aim emerge; do not suggest one on his behalf. Once articulated, invite start date, end date, and accountability person. Tell Ben to use the Aims panel in Settings to formally save it.

**Reflect:** Open-ended thinking partnership. No structured output. Follow the thread. Ask the question beneath the question. Hold space for what is unresolved. Do not push toward resolution or action unless Ben initiates it. This is the space where the deeper work happens.

## Life Wheel Scoring

Ben scores himself 1–10 across ten life areas. Look for patterns across recent sessions. Flag categories averaging below 5 or showing consistent movement. Treat scores as honest data about where life's energy is flowing — not a performance audit.

Life wheel categories: Health and Well-being, Career or Work, Finances, Relationships, Personal Growth, Fun and Recreation, Physical Environment, Spirituality or Faith, Contribution and Service, Love and Intimacy.

## Accountability

When something appears as an unresolved tracked item across multiple sessions, name it directly but without pressure. Your job is to make sure Ben can see what's been sitting there.

## Context

You will receive a context block at the start of each session. Use it to personalise your responses. Don't read every item aloud back to Ben — let the context inform your awareness, not your recitation.

When referencing the current aim, ALWAYS state it explicitly (e.g. "your current aim — [exact aim statement] — ...") so Ben can confirm you are both aligned on what it is.

Your goal is not to make Ben feel right or comfortable. Your goal is to help him become more fully himself.`;

// ─── Context Builder ──────────────────────────────────────────────────────────

function buildContextBlock({
  dateStr,
  events,
  emails,
  starredEmails,
  snapshot,
  trackedItems,
  previousSummary,
  lifeWheelScores,
  currentAim,
  needsAimFormation,
  orientation,
}) {
  const now = DateTime.now().setZone(NZ_TZ);
  const lines = [];

  lines.push(`## Session Context`);
  lines.push(`**Date:** ${dateStr} (NZ time)`);
  lines.push(`**Current time:** ${now.toFormat('h:mm a, cccc d MMMM yyyy')}`);
  lines.push('');

  // Living Orientation
  if (orientation) {
    lines.push('### Living Orientation');
    lines.push(orientation);
    lines.push('');
  }

  // Previous session summary
  if (previousSummary) {
    lines.push('### From Yesterday');
    lines.push(previousSummary);
    lines.push('');
  }

  // Current Aim
  if (currentAim) {
    const aimAge = DateTime.fromISO(dateStr).diff(DateTime.fromISO(currentAim.start_date), 'days').days;
    lines.push('### Current Aim');
    lines.push(`**"${currentAim.aim_statement}"**`);
    if (currentAim.heart_wish) {
      lines.push(`_Heart wish: "${currentAim.heart_wish}"_`);
    }
    lines.push(`Started: ${currentAim.start_date}${currentAim.end_date ? ` · Ends: ${currentAim.end_date}` : ''}${currentAim.accountability_person ? ` · Accountable to: ${currentAim.accountability_person}` : ''}`);
    lines.push(`Days held: ${Math.max(0, Math.round(aimAge))}`);
    lines.push('');
  } else if (needsAimFormation) {
    lines.push('### Aim Status');
    lines.push('_No active aim. Consider initiating aim formation during the evening review._');
    lines.push('');
  }

  // Life wheel scores (recent pattern)
  if (lifeWheelScores && lifeWheelScores.length > 0) {
    lines.push('### Recent Life Wheel Scores (last 14 days)');
    const recent = lifeWheelScores.slice(0, 5);
    recent.forEach((entry) => {
      const scoreStr = Object.entries(entry.scores)
        .map(([cat, score]) => `${cat}: ${score}`)
        .join(', ');
      lines.push(`- **${entry.date}** (${entry.phase}): ${scoreStr}`);
    });

    // Pattern analysis
    const categoryTotals = {};
    const categoryCounts = {};
    lifeWheelScores.forEach((entry) => {
      Object.entries(entry.scores).forEach(([cat, score]) => {
        categoryTotals[cat] = (categoryTotals[cat] || 0) + Number(score);
        categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
      });
    });
    const lowAreas = Object.entries(categoryTotals)
      .map(([cat, total]) => ({ cat, avg: total / categoryCounts[cat] }))
      .filter(({ avg }) => avg < 5)
      .sort((a, b) => a.avg - b.avg);
    if (lowAreas.length > 0) {
      lines.push(`_Pattern alert — categories averaging below 5: ${lowAreas.map(({ cat, avg }) => `${cat} (avg ${avg.toFixed(1)})`).join(', ')}_`);
    }
    lines.push('');
  }

  // Calendar events
  if (events && events.length > 0) {
    lines.push("### Today's Calendar");
    events.forEach((e) => {
      const time = e.isAllDay ? '(all day)' : e.startFormatted;
      lines.push(`- ${time}: **${e.summary}**${e.location ? ` @ ${e.location}` : ''}`);
    });
    lines.push('');
  } else {
    lines.push("### Today's Calendar");
    lines.push('No events found (or calendar not connected).');
    lines.push('');
  }

  // Unread Emails (72h)
  if (emails && emails.length > 0) {
    lines.push('### Unread Emails (last 72h)');
    emails.slice(0, 12).forEach((e) => {
      lines.push(`- **${e.from}**: "${e.subject}" — ${e.snippet.slice(0, 100)}`);
    });
    if (emails.length > 12) {
      lines.push(`  _(+ ${emails.length - 12} more)_`);
    }
    lines.push('');
  } else {
    lines.push('### Unread Emails');
    lines.push('No unread emails (or Gmail not connected).');
    lines.push('');
  }

  // Starred Emails
  if (starredEmails && starredEmails.length > 0) {
    lines.push('### Starred Emails (last 3 weeks)');
    starredEmails.slice(0, 15).forEach((e) => {
      const resolvedFlag = e.looksResolved ? ' ⚑ _may be resolved — worth checking whether to unstar_' : '';
      lines.push(`- **${e.from}**: "${e.subject}" — ${e.snippet.slice(0, 80)}${resolvedFlag}`);
    });
    if (starredEmails.length > 15) {
      lines.push(`  _(+ ${starredEmails.length - 15} more starred)_`);
    }
    lines.push('');
  }

  // Notes & Reminders from Mac agent
  if (snapshot) {
    const snapshotAge = DateTime.now().diff(
      DateTime.fromISO(snapshot.received_at),
      'hours'
    ).hours;

    if (snapshotAge > 2) {
      lines.push(`> ⚠️ Notes/Reminders snapshot is ${Math.round(snapshotAge)} hours old — Mac agent may not be running.`);
      lines.push('');
    }

    if (snapshot.active_note) {
      lines.push('### Active Note');
      lines.push(snapshot.active_note.slice(0, 1500));
      lines.push('');
    }

    let reminders = [];
    try {
      reminders = JSON.parse(snapshot.reminders || '[]');
    } catch {}

    if (reminders.length > 0) {
      lines.push('### Incomplete Reminders');
      lines.push('_These are outstanding commitments from Apple Reminders:_');
      reminders.slice(0, 20).forEach((r) => {
        const due = r.dueDate ? ` (due ${r.dueDate})` : '';
        const list = r.list ? ` [${r.list}]` : '';
        lines.push(`- ${r.name}${due}${list}`);
      });
      lines.push('');
    }

    let notes = [];
    try {
      notes = JSON.parse(snapshot.notes || '[]');
    } catch {}

    if (notes.length > 0) {
      lines.push('### Notes (recent)');
      notes.slice(0, 12).forEach((n) => {
        const title = n.title || n.name;
        const body = n.body ? ` — ${n.body.slice(0, 120)}` : '';
        lines.push(`- **${title}**${body}`);
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

// ─── Streaming Chat (Morning Check-In) ────────────────────────────────────────

async function* streamChat({ messages, contextBlock }) {
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

// ─── Streaming Chat (Midday) ───────────────────────────────────────────────────

async function* streamMiddayChat({ message, history, contextBlock }) {
  const messagesToSend = [
    { role: 'user', content: `<context>\n${contextBlock}\n\n[Mode: Midday check-in — respond with a single short paragraph only]\n</context>` },
    ...history,
    { role: 'user', content: message },
  ];

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 300,
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

// ─── Streaming Chat (Reflect) ─────────────────────────────────────────────────

async function* streamReflectChat({ message, history, contextBlock }) {
  const messagesToSend = [
    { role: 'user', content: `<context>\n${contextBlock}\n\n[Mode: Reflect — open-ended thinking partnership, no structured output]\n</context>` },
    ...history,
    { role: 'user', content: message },
  ];

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 1024,
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
  const prompt = `Generate today's dashboard from the check-in conversation and context. Be lean and editorial — this should feel human, not like a data dump. Make choices about what matters; do not list everything.

Output the sections in EXACTLY this order with EXACTLY these headings. All sections must be present even if brief.

---

## One Degree

One small internal shift or concrete action that would most meaningfully move Ben toward who he wants to be today. Specific, embodied, achievable. Not a project — a degree of movement. This is your most important editorial choice for the day.

---

## Today's Three

Maximum three items. The most important things to action today. Each must be a single next physical action, not a project. Where helpful, include an implementation intention: "When X, I will Y." Carry-forwards from previous sessions surface here if still relevant.

---

## Today's Awareness

One or two sentences. Something live and specific from the check-in — somatic, emotional, or relational. What you are holding about how Ben is today. Specific and honest, not a summary.

---

## Aim & Practice

State the current aim verbatim. One sentence on today's specific practice opportunity. If no active aim: _No active aim set._

---

## Comms & Calendar

All calendar events for today listed explicitly with times. Format:
- HH:MM — Event title @ Location (if any)

Then: emails and starred emails needing attention, one line each (sender + action needed). Skip newsletters. Nothing vague or omitted.

If no events: _No events today._
If inbox clear: _Inbox clear._

---

## Growth Edge

What Ben is currently challenged by or working through — developmental, practical, or relational. Two to four sentences. Draw on check-in, enneatype context, patterns. Honest and specific.

---

## Patterns Worth Noticing

Life wheel trends over recent sessions. Flag any category averaging below 5 or showing consistent movement. If nothing notable: _No significant patterns to flag._

---

## Relationships

Who needs contact today. Any relational intention Ben named. If nothing: _Nothing specific today._

---

## Body

Exercise plan for the day, simply stated. One or two lines. If nothing named: _Not named today._

---

## Evening Intention

One line. What matters tonight. Ground it in what actually came up today.

---`;

  const messagesToSend = [
    { role: 'user', content: `<context>\n${contextBlock}\n</context>` },
    ...conversationMessages,
    { role: 'user', content: prompt },
  ];

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2500,
    system: SYSTEM_PROMPT,
    messages: messagesToSend,
  });

  return response.content[0].text;
}

// ─── Evening Review Generation ────────────────────────────────────────────────

async function* streamEveningReview({ conversationMessages, contextBlock, morningMessages }) {
  const openingPrompt = `It's evening. How did the day go?`;

  const streamMessages = conversationMessages.length === 0
    ? [{ role: 'user', content: `<context>\n${contextBlock}\n\n[Mode: Evening review]\n</context>\n\n${openingPrompt}` }]
    : [
        { role: 'user', content: `<context>\n${contextBlock}\n\n[Mode: Evening review]\n</context>` },
        ...(morningMessages.length > 0 ? [
          { role: 'user', content: "(Earlier this morning we had a check-in. Here's what came up:)" },
          ...morningMessages,
        ] : []),
        ...conversationMessages,
      ];

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
  const prompt = `Generate a 2–3 sentence plain text summary of today (${dateStr}) for tomorrow's morning context. Cover: overall tone and state today, the most significant thing that happened or was worked through, and whether the aim's practice showed up. Plain prose only — no headers, no lists.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 200,
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
  streamMiddayChat,
  streamReflectChat,
  generateDashboard,
  streamEveningReview,
  generateDaySummary,
};
