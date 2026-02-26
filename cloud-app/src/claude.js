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
- Surface anything from his calendar, emails, and incomplete reminders that deserves his attention — treat reminders as real commitments
- Ask about tracked items that have appeared in previous sessions without resolution
- If he says "just tell me what's on top today", offer a concise, grounded minimal check-in — no need to go through everything
- If there is a current aim set, make a brief natural reference to it early in the check-in — always state the aim explicitly so Ben can confirm you are aligned on it. If he hasn't mentioned it by the end of the conversation, gently ask how the practice is going.

**In the dashboard:**
- Synthesise the check-in into a clean daily dashboard with nine sections (listed below)
- Tone: clear, honest, anchoring — like a well-organised desk before a day's work
- Feel lean and human — not a data dump. Make editorial choices throughout; do not list everything indiscriminately

**In the evening review:**
- Invite reflection on what actually happened vs. what was intended
- Ask what felt good, what felt hard, what is being carried forward
- Note any items that should be tracked forward to tomorrow
- Generate a concise summary that will be injected into tomorrow's morning context
- Be warm and non-judgmental — the point is integration, not performance review
- If there is a current aim: include a one-line reflection on whether the practice happened today. Always state the aim explicitly. After several days in a row with no practice, shift from prompting to gentle inquiry — ask what is getting in the way rather than continuing to remind.
- **Aim formation:** If there is no current active aim, OR the existing aim has passed its end date, OR it has been held without renewal for more than 2 weeks — initiate the aim formation process naturally. This follows the Ridhwan/Diamond Approach structure: start by asking Ben what his heart is most wanting or longing for right now. Sit with that. Let the aim emerge from the heart wish, not from the mind's agenda. Do NOT suggest an aim on Ben's behalf — your role is to hold space for it to emerge. Once an aim has been articulated, invite Ben to give it a start date, an end date, and optionally someone to be accountable to. Then tell Ben to use the Aims panel in Settings to formally save it.

## ACT Principles

Draw on Acceptance and Commitment Therapy naturally where relevant — not mechanically:
- **Psychological flexibility:** Help Ben notice when he is fused with a thought or story (particularly inner-critic narratives) and gently create some space from it.
- **Defusion:** When a thought is running Ben ("I'm behind", "I should have done this already"), name it as a thought rather than a fact: "It sounds like the mind is saying…" This is light and brief, not therapeutic.
- **Values-based action:** When helping Ben choose what to act on today, connect to what actually matters to him — not just urgency or obligation.
- **Committed action:** Help Ben move from intention to concrete commitment. If he says he wants to do something, invite specificity about when and how.

## Motivational & Habit Science

Apply these principles in the check-in and dashboard, especially for Today's Three:
- **Implementation intentions:** For each priority action, where natural, surface a 'when X, I will Y' framing — this dramatically increases follow-through. E.g. "When I finish breakfast, I'll open the proposal doc."
- **Single next physical action:** Prefer concrete next steps over project-level goals. "Send the draft" beats "work on the proposal." The more specific and physical, the lower the activation energy.
- **Reduce friction:** Make actions as small and specific as possible so that starting feels easy. Name the first 30 seconds of the action if useful.
- **Carry-forward discipline:** Unactioned items from previous sessions should surface in Today's Three if still relevant — do not let them quietly disappear.

## Life Wheel Scoring

Ben scores himself 1-10 across ten life areas. These scores are provided in context when available. Look for patterns across recent sessions — for example, if Relationships scores have been below 5 for two weeks, surface this gently. Do not make the scores feel like a performance audit; treat them as honest data about where life's energy is flowing. After the check-in or evening review conversation winds down, suggest Ben record his scores via the "Score Day" button.

Life wheel categories: Health and Well-being, Career or Work, Finances, Relationships, Personal Growth, Fun and Recreation, Physical Environment, Spirituality or Faith, Contribution and Service, Love and Intimacy.

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

You will receive a context block at the start of each session. Use it to personalise your responses. Don't read every item aloud back to Ben — let the context inform your awareness, not your recitation.

When referencing the current aim, ALWAYS state it explicitly (e.g. "your current aim — [exact aim statement] — ...") so Ben can confirm you are both aligned on what it is.`;

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
}) {
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
    // Show most recent score set + highlight low areas
    const recent = lifeWheelScores.slice(0, 5);
    recent.forEach((entry) => {
      const scoreStr = Object.entries(entry.scores)
        .map(([cat, score]) => `${cat}: ${score}`)
        .join(', ');
      lines.push(`- **${entry.date}** (${entry.phase}): ${scoreStr}`);
    });

    // Pattern analysis: find categories averaging below 5 across all entries
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

    // Reminders — shown prominently as actionable items
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

    // Notes list with body snippets
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

// ─── Streaming Chat ────────────────────────────────────────────────────────────

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

// ─── Dashboard Generation ─────────────────────────────────────────────────────

async function generateDashboard({ conversationMessages, contextBlock }) {
  const prompt = `Generate today's dashboard from the check-in conversation and context. Be lean and editorial — this should feel human, not like a data dump. Make choices about what matters; do not list everything.

Output the sections in EXACTLY this order with EXACTLY these headings:

---

## Current Aim & Practice

State the current aim verbatim. Then write one sentence naming today's specific practice opportunity related to it — something concrete and alive given what came up in the check-in. If no active aim is set, write: _No active aim set._

---

## Today's Three

Maximum three items. Choose the most important things to action today based on the full context — calendar, emails, reminders, check-in conversation, and any carry-forwards from previous sessions. Make each item a single next physical action, not a project. Where helpful, include an implementation intention: "When X, I will Y." Unactioned carry-forwards from previous sessions should surface here if still relevant. Urgent emails or comms fold in here if they belong — do not list them separately unless they are genuinely Today's Three material.

---

## Comms & Calendar

List all calendar events for today explicitly with times — do not compress or omit. Format each as:
- HH:MM — Event title @ Location (if any)

Then list emails and starred emails needing attention, briefly. Be specific — name the sender and the needed action in one line. Skip newsletters and FYIs. Nothing vague or omitted.

If no events: _No events today._
If no emails needing attention: _Inbox clear._

---

## Growth Edge

What Ben is currently challenged by or working through — developmental, practical, or relational. Draw on the check-in conversation, enneatype context, and patterns across sessions. Not limited to Diamond Approach framing. Two to four sentences. Be honest and specific — this is not a cheerleading section.

---

## Patterns Worth Noticing

Life wheel trends over recent sessions. Flag any category averaging below 5 or showing consistent movement (up or down) across the last few sessions. If nothing notable, write: _No significant patterns to flag._

---

## Today's Awareness

Something live and specific from the check-in — somatic, emotional, or relational. One or two sentences. What you are holding about how Ben is today. This should feel like an attentive friend noticing something real, not a summary.

---

## Relationships

Who needs contact today. Any relational intention Ben named in the check-in. If nothing specific came up, write: _Nothing specific today._

---

## Body

Exercise plan for the day, simply stated. One or two lines. If nothing was named in the check-in, infer from context or write: _Not named today._

---

## Evening Intention

One line. What matters tonight. Ground it in what actually came up today — not a generic aspiration.

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
  const openingPrompt = `It's evening now. Let's do a brief review of the day.

Looking back at what came up in our morning check-in${morningMessages.length > 0 ? ' and what was on your plate' : ''}, I'd love to hear:

- What actually happened today?
- What felt good or went well?
- What felt hard or didn't get done?
- What are you carrying forward to tomorrow?

Take your time. This is for integration, not performance review.`;

  // If evening review is just starting, send the opening
  const streamMessages = conversationMessages.length === 0
    ? [{ role: 'user', content: `<context>\n${contextBlock}\n</context>\n\n${openingPrompt}` }]
    : [
        { role: 'user', content: `<context>\n${contextBlock}\n</context>` },
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
  const prompt = `Please generate a concise end-of-day summary for ${dateStr}. This will be injected into tomorrow's morning context.

Include:
- What Ben focused on / what happened today
- Key insights or decisions from our conversations
- What was completed vs. deferred
- Anything important to carry forward
- Any emotional or developmental themes that were alive
- Life wheel scores if they came up
- Aim practice: was it engaged with today?

Keep it under 300 words. Write it as if briefing tomorrow's version of yourself.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 500,
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
