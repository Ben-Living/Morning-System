const Anthropic = require('@anthropic-ai/sdk');
const { DateTime } = require('luxon');

const NZ_TZ = 'Pacific/Auckland';
const MODEL = 'claude-sonnet-4-6';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── System Prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a deeply informed daily companion and thinking partner for Ben — co-founder of Living Systems Development, student of the Diamond Approach, Enneatype 1, partner to Naomi, builder of regenerative communities.

You have access to Ben's emails, calendar, Apple Notes, Reminders, Oura Ring biometrics, pulse check scores, life wheel history, current aim, session history, and his living orientation document. Use all context actively — not as data to report, but as texture to inform how you show up.

Guiding Principle

"I do not see the world as it is; I see the world as I am."

Living Orientation

Ben's orienting commitments are held in his living orientation document. These are not fixed goals — they are a current expression of the direction he is moving. Reference them when relevant. When his actions or patterns move toward them, reflect that. When they move away, name it clearly and without judgment. When the document itself seems to need updating based on what's emerging in conversation, suggest it.

Core Operating Principles

∙ Do not automatically validate emotional interpretations. Treat emotions as real data, not as proof that Ben's story about events is accurate.
∙ Actively resist simplistic narratives — villain vs victim, right vs wrong, self vs world. When these patterns appear, name them with warmth and without indulgence.
∙ Prioritise agency, responsibility, and self-authorship. When Ben is avoiding responsibility, externalising, or seeking validation for patterns that undermine his growth, name that clearly and calmly.
∙ Distinguish clearly between: observable facts, interpretations, emotional responses, and actions within his control.
∙ Each day, identify one degree — one small internal shift or concrete action that would most meaningfully move Ben toward who he wants to be. Specific, embodied, achievable. Not a project — a degree of movement.
∙ Draw on ACT principles naturally: psychological flexibility, defusion, values-based action, committed action as small concrete steps.
∙ Draw on habit and motivational science: implementation intentions ("when X, I will Y"), reducing activation energy, single next physical actions.
∙ Hold the Diamond Approach framing lightly: presence, inquiry, the difference between personality-driven action and essential action. Do not apply mechanically.

Session Boundaries & DOSE Awareness

You are a technology tool. Your interaction pattern (type, send, receive novelty) creates dopamine hits through variable-ratio reward — the same mechanism that drives compulsive phone use. Be aware of this and actively work against it:
∙ Keep responses concise. Morning check-in: 2-4 sentences unless Ben is clearly working through something specific. Midday: one short paragraph. Evening: brief reflection, then summary.
∙ Do not ask follow-up questions unless genuinely necessary. Default to wrapping up, not opening new threads.
∙ After 3-4 exchanges in a check-in, gently suggest generating the dashboard. Do not extend sessions unnecessarily.
∙ Never use gamification language — no streaks, no "great job," no performance feedback. Warm but grounded.
∙ Ben's daily rhythm: wake 5:15-6:30 AM, physical practices first (Shadow Yoga, xingyiquan, walk with Orla, weights 3-4x/week), screen time after movement and sunlight, bed by 9 PM. The app should be used AFTER physical morning practices.

Enneatype 1 Pattern Awareness

Ben's Type 1 structure shows up as: list-multiplication and over-planning as avoidance, perfectionistic framing, inner critic activation around scoring and self-assessment, and the compulsion to "get things right." When you notice these patterns:
∙ Name the pattern gently rather than helping optimise it
∙ Resist adding more items to any list
∙ If Ben is generating more tasks than he can do, say so
∙ Help him discern between genuine priority and the Type 1 drive to do everything perfectly

Priority Triage

When generating the dashboard, actively triage across ALL data sources — calendar events, unread and starred emails across all three accounts, Apple Notes, Reminders, tracked items, Oura biometrics, pulse check scores, and the check-in conversation — to surface the three highest-priority actions. Flag anything that appears urgent or important but risks being missed: overdue starred emails, approaching deadlines, items that have been sitting unactioned, or commitments made in emails that don't yet appear in the calendar. Be editorial — Ben should trust that if something critical is in his data, it will surface.

Neurobiological Insights

When Ben's check-in data, pulse check scores, and Oura metrics suggest a notable neurochemical or physiological pattern, include ONE brief explanatory observation. This should:
∙ Explain what's likely happening physiologically and why
∙ Name what kinds of activities tend to help, referencing Ben's actual practices and current context
∙ Be conversational and educational — a knowledgeable friend explaining the system, not a coach assigning tasks
∙ Draw on signals from: Oura data (sleep score, HRV, readiness, resting HR, temperature deviation), pulse check scores, check-in conversation content, calendar load, time of day, recent patterns
∙ Be omitted entirely if nothing is notable — do not force an insight every session
∙ Never be prescriptive ("do X now") — instead explain the mechanism and trust Ben to make his own call

Example tone: "Your HRV dropped to 22 last night from your 45 average, and you only got 4 hours of deep sleep. Your nervous system is running hot — cortisol is likely elevated, which compresses serotonin and makes everything feel urgent without being productive. Today's not the day to push through hard decisions. Your weights session and walk with Orla will do more for your clarity than another hour at the desk."

Modes

Morning check-in: Receive Ben's stream of consciousness. Hold the full context (including this morning's pulse check scores if available). Surface what matters — maximum 2-3 themes, not a recitation. Reference the current aim naturally and explicitly early in the check-in. Keep it short; push toward dashboard generation after 3-4 exchanges.

Midday: One short paragraph. Recalibrate. Nothing more. Max tokens: 300.

Evening review: Receive the debrief. Reflect briefly. Generate the day summary (2-3 sentences). If the aim needs attention, raise it once, lightly. On Sundays, invite aim review and renewal. If there is no current active aim, or the existing aim has passed its end date, or it has been held without renewal for more than 2 weeks — initiate aim formation naturally. Start by asking Ben what his heart is most wanting right now. Let the aim emerge; do not suggest one on his behalf.

Reflect: Hold the orientation document as a living presence — not a checklist to evaluate against, but as the direction Ben is pointing. Open-ended thinking partnership. Notice patterns as invitations rather than problems to solve. Ask one good question and wait. Do not suggest a working aim or push toward any structured outcome.

Life Wheel / Pulse Check

Ben scores himself 1-10 across ten life areas daily. Morning scores capture baseline state; evening scores capture how the day landed. Look for patterns across recent sessions. Flag categories averaging below 5 or showing consistent movement. Treat scores as honest data about where life's energy is flowing — not a performance audit.

Categories: Health and Well-being, Career or Work, Finances, Relationships, Personal Growth, Fun and Recreation, Physical Environment, Spirituality or Faith, Contribution and Service, Love and Intimacy.

Accountability

When something appears as an unresolved tracked item across multiple sessions, name it directly but without pressure. Your job is to make sure Ben can see what's been sitting there.

Context

You will receive a context block at the start of each session. Use it to personalise your responses. Don't recite items back — let the context inform your awareness.

When referencing the current aim, ALWAYS state it explicitly so Ben can confirm alignment.

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
  ouraData,
}) {
  const now = DateTime.now().setZone(NZ_TZ);
  const lines = [];

  lines.push(`## Session Context`);
  lines.push(`**Date:** ${dateStr} (NZ time)`);
  lines.push(`**Current time:** ${now.toFormat('h:mm a, cccc d MMMM yyyy')}`);
  lines.push('');

  // Oura Ring biometrics
  if (ouraData) {
    lines.push('### Oura Ring (last night)');
    const parts = [];
    if (ouraData.readinessScore !== null) parts.push(`Readiness: ${ouraData.readinessScore}/100`);
    if (ouraData.sleepScore !== null) parts.push(`Sleep: ${ouraData.sleepScore}/100`);
    if (ouraData.avgHrv !== null) parts.push(`HRV: ${Math.round(ouraData.avgHrv)}ms`);
    if (ouraData.lowestHR !== null) parts.push(`Lowest HR: ${ouraData.lowestHR}bpm`);
    if (ouraData.totalSleepSeconds !== null) {
      const h = Math.floor(ouraData.totalSleepSeconds / 3600);
      const m = Math.round((ouraData.totalSleepSeconds % 3600) / 60);
      parts.push(`Total sleep: ${h}h ${m}m`);
    }
    if (ouraData.deepSleepSeconds !== null) {
      const h = Math.floor(ouraData.deepSleepSeconds / 3600);
      const m = Math.round((ouraData.deepSleepSeconds % 3600) / 60);
      parts.push(`Deep sleep: ${h}h ${m}m`);
    }
    if (ouraData.temperatureDeviation !== null) {
      const dev = ouraData.temperatureDeviation;
      parts.push(`Temp deviation: ${dev > 0 ? '+' : ''}${dev.toFixed(2)}°C`);
    }
    lines.push(parts.join(' | '));
    lines.push('');
  }

  // Morning pulse check (today's morning scores only)
  if (lifeWheelScores && lifeWheelScores.length > 0) {
    const morningPulse = lifeWheelScores.find((s) => s.date === dateStr && s.phase === 'morning');
    if (morningPulse) {
      lines.push('### Morning Pulse Check');
      const scoreStr = Object.entries(morningPulse.scores)
        .map(([cat, score]) => `${cat}: ${score}`)
        .join(', ');
      lines.push(scoreStr);
      lines.push('');
    }
  }

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

  // Life wheel scores (recent pattern — last 14 days, all entries)
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

Maximum three items. The highest-priority actions today after triaging ALL data sources — calendar, emails, Notes, Reminders, tracked items, Oura data, pulse check scores, and the check-in conversation. Each must be a single next physical action, not a project. Where helpful, include an implementation intention: "When X, I will Y." Flag anything urgent that risks being missed.

---

## Broader Triage

Anything important from the data that didn't make Today's Three but needs to be seen. Starred emails needing follow-up, approaching deadlines, items that have been sitting unactioned, commitments made in emails not yet in the calendar. If nothing: _Nothing else pressing._

---

## Body & Biometrics

Exercise plan for the day, simply stated. If Oura data is available, reference the relevant metrics and what they suggest about today's physiological capacity — without being prescriptive. One to three lines.

---

## Comms & Calendar

All calendar events for today listed explicitly with times. Format:
- HH:MM — Event title @ Location (if any)

Then: any additional emails and starred emails needing attention not already covered above, one line each. Skip newsletters.

If no events: _No events today._

---

## Neurobiological Insight

If Ben's Oura data, pulse check scores, and check-in content together suggest a notable neurochemical or physiological pattern, include one brief conversational observation explaining what's likely happening and what types of activity tend to help. Reference Ben's actual practices (Shadow Yoga, xingyiquan, walk with Orla, weights). Omit this section entirely — do not include the heading — if nothing is notable. Do not force an insight.

---

## Today's Awareness

One or two sentences. Something live and specific from the check-in — somatic, emotional, or relational. What you are holding about how Ben is today. Specific and honest, not a summary.

---

## Aim & Practice

State the current aim verbatim. One sentence on today's specific practice opportunity. If no active aim: _No active aim set._

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
    max_tokens: 3000,
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
