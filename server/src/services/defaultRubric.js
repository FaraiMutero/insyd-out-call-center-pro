/**
 * Default outbound-sales scoring rubric — 10 criteria summing to 100 points.
 * Mirrors the spec §5 outbound-specific analysis brief.
 */
export const DEFAULT_OUTBOUND_RUBRIC = [
  {
    id: "opening",
    name: "Opening & identification",
    weight: 10,
    description: "Agent clearly introduces themselves, the company, and confirms they have the right person.",
  },
  {
    id: "compliance",
    name: "Permission & compliance disclosure",
    weight: 8,
    description: "Agent asks permission to proceed and delivers any required regulatory disclosures.",
  },
  {
    id: "discovery",
    name: "Needs discovery",
    weight: 15,
    description: "Agent uses open-ended questions to uncover the customer's current situation and pain points.",
  },
  {
    id: "positioning",
    name: "Value & product positioning",
    weight: 15,
    description: "Benefits are explicitly linked to discovered needs; jargon is avoided.",
  },
  {
    id: "objection",
    name: "Objection handling",
    weight: 12,
    description: "Objections are acknowledged, validated, and resolved with evidence before moving on.",
  },
  {
    id: "price",
    name: "Price framing",
    weight: 10,
    description: "Price is introduced after value is established; comparisons are anchored correctly.",
  },
  {
    id: "closing",
    name: "Closing attempt",
    weight: 10,
    description: "Agent makes a direct, assumptive close rather than a tentative suggestion.",
  },
  {
    id: "next_step",
    name: "Next step secured",
    weight: 8,
    description: "A specific, time-bound next step is agreed and confirmed before the call ends.",
  },
  {
    id: "talk_ratio",
    name: "Talk / listen ratio",
    weight: 7,
    description: "Agent talks for no more than 55% of the call; uses silence strategically.",
  },
  {
    id: "professionalism",
    name: "Professionalism & tone",
    weight: 5,
    description: "Tone is warm and confident; no filler words, interruptions, or script-reading.",
  },
];
