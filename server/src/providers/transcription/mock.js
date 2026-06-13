/**
 * Mock transcription provider — fully offline, deterministic output keyed to the recording filename.
 * Generates realistic two-party call segments with realistic speaker turns.
 * Used in dev, CI, and demo mode (TRANSCRIPTION_PROVIDER=mock or unset).
 */

const CALL_SCRIPTS = [
  {
    type: "outbound_sales",
    segments: [
      { speaker: "AGENT", text: "Good morning! Am I speaking with the account holder? This is {agent} calling from InsydOut Insurance." },
      { speaker: "CUSTOMER", text: "Yes, speaking. What's this about?" },
      { speaker: "AGENT", text: "I'm reaching out because we've put together a home and auto bundle that's saving customers in your area between fifteen and twenty-five percent. Do you have about two minutes?" },
      { speaker: "CUSTOMER", text: "I'm a bit busy, but okay — go ahead." },
      { speaker: "AGENT", text: "I appreciate that. Quick question — are you currently paying for your home and vehicle insurance separately?" },
      { speaker: "CUSTOMER", text: "Yes, through different providers actually." },
      { speaker: "AGENT", text: "That's very common, and honestly that's where the biggest savings are. When they're bundled, the underwriters discount both. Based on the average policy in your area, that's usually around four to six hundred rand a month back in your pocket." },
      { speaker: "CUSTOMER", text: "That does sound like a lot. What would I need to do?" },
      { speaker: "AGENT", text: "Just a few details — your current vehicle and your property type. I can run a no-obligation quote in about three minutes. Shall I proceed?" },
      { speaker: "CUSTOMER", text: "Yes, let's do that." },
      { speaker: "AGENT", text: "Perfect. And what's the make and model of your vehicle?" },
      { speaker: "CUSTOMER", text: "It's a 2021 Toyota Corolla." },
      { speaker: "AGENT", text: "Great choice. And your property — is it a freestanding house or a sectional title?" },
      { speaker: "CUSTOMER", text: "Freestanding house, three bedrooms." },
      { speaker: "AGENT", text: "Excellent. I'm running the quote now. Based on those details, I can see a saving of around four hundred and eighty rand per month versus separate policies. I'd like to get this formalised for you — can I email you the full breakdown?" },
      { speaker: "CUSTOMER", text: "Yes, please send it through." },
      { speaker: "AGENT", text: "Will do. I'll also send a callback slot so we can go through the details together. Is there a preferred time — morning or afternoon?" },
      { speaker: "CUSTOMER", text: "Morning is better, before ten." },
      { speaker: "AGENT", text: "Perfect. I'll book you in for tomorrow at nine. You'll get a confirmation SMS now. Thank you so much for your time today!" },
      { speaker: "CUSTOMER", text: "Thank you, bye." },
    ],
  },
  {
    type: "objection_handling",
    segments: [
      { speaker: "AGENT", text: "Good afternoon, this is {agent} from InsydOut. I'm calling to follow up on a quote request submitted earlier this week. Is that correct?" },
      { speaker: "CUSTOMER", text: "I don't remember submitting anything, to be honest." },
      { speaker: "AGENT", text: "I apologise for any confusion — your details may have come through a comparison site. I just wanted to make sure you got the best rate. Do you currently have cover?" },
      { speaker: "CUSTOMER", text: "Yes, I do. I'm quite happy with my current insurer." },
      { speaker: "AGENT", text: "That's great — it means you understand the value of being covered. Can I ask, when did you last do a premium review? Most people save significantly after a review." },
      { speaker: "CUSTOMER", text: "It's been a while actually, maybe two years." },
      { speaker: "AGENT", text: "In that time, premiums on older policies typically increase by eight to twelve percent annually without a review. We often find customers saving up to thirty percent just by rerunning the numbers. It's worth a five-minute check, isn't it?" },
      { speaker: "CUSTOMER", text: "I suppose so, but I don't want to be switched without knowing all the details." },
      { speaker: "AGENT", text: "Absolutely — and we'd never do that. This is purely a comparison, no commitment whatsoever. I'll send you a side-by-side breakdown. If it doesn't make sense, you stay where you are. Fair enough?" },
      { speaker: "CUSTOMER", text: "That's fair. Send me the comparison." },
      { speaker: "AGENT", text: "Will do. What's the best email address for you?" },
      { speaker: "CUSTOMER", text: "Use the one you have on file." },
      { speaker: "AGENT", text: "Perfect. I'll get that out to you by end of today and follow up on Thursday. Is that okay?" },
      { speaker: "CUSTOMER", text: "Yes, fine." },
    ],
  },
  {
    type: "service_call",
    segments: [
      { speaker: "CUSTOMER", text: "Hi, I need to update my vehicle details on my policy." },
      { speaker: "AGENT", text: "Good day! You've reached {agent} at InsydOut Insurance. I'd be happy to help. Can I take your policy number or ID number to pull up your account?" },
      { speaker: "CUSTOMER", text: "Sure, it's ID 7809155012082." },
      { speaker: "AGENT", text: "Thank you. I can see your account here. You're looking to update the vehicle details. Are you replacing or adding a vehicle?" },
      { speaker: "CUSTOMER", text: "Replacing. I just sold my 2019 Corolla and bought a 2023 Mazda CX-5." },
      { speaker: "AGENT", text: "Congratulations on the new car! I'll update that now. The CX-5 is in a slightly higher rated category due to part costs, so the premium will increase by approximately one hundred and ten rand per month. Are you happy to proceed with that?" },
      { speaker: "CUSTOMER", text: "Yes, that's fine — I expected it might go up a little." },
      { speaker: "AGENT", text: "Great. I've updated the vehicle. Your new schedule of benefits will be emailed to you within thirty minutes. The change takes effect from today. Is there anything else I can help you with?" },
      { speaker: "CUSTOMER", text: "No, that's everything. Thank you." },
      { speaker: "AGENT", text: "Pleasure. Have a wonderful day!" },
    ],
  },
  {
    type: "cancellation_risk",
    segments: [
      { speaker: "CUSTOMER", text: "I want to cancel my policy. I've been shopping around and found something much cheaper." },
      { speaker: "AGENT", text: "I'm sorry to hear that. My name is {agent} and I really want to make sure we explore every option before you go. Can I ask which provider you're looking at and the premium difference?" },
      { speaker: "CUSTOMER", text: "It's about three hundred and fifty rand cheaper per month." },
      { speaker: "AGENT", text: "That's significant, and I understand. Before I process anything, I'd like to do a quick cover comparison — sometimes the saving comes at the cost of important benefits. Would you mind giving me two minutes?" },
      { speaker: "CUSTOMER", text: "Fine, but I've made up my mind." },
      { speaker: "AGENT", text: "I respect that. Can I ask — does the new policy include hijacking cover and emergency assist?" },
      { speaker: "CUSTOMER", text: "I'm not sure actually. I didn't check that." },
      { speaker: "AGENT", text: "That's quite common. Hijacking cover and roadside assist alone are valued at around two hundred rand monthly. So the real saving could be closer to one-fifty. Still meaningful, but I want to make sure you're making a fully informed decision." },
      { speaker: "CUSTOMER", text: "Hmm, I hadn't thought of that." },
      { speaker: "AGENT", text: "What I can do is match your current cover at a reduced premium. I have approval to offer you a fifteen percent discount if you stay. That would bring your monthly premium down by around two hundred and twenty rand. Would that change things?" },
      { speaker: "CUSTOMER", text: "That actually does change things. Can you put that in writing?" },
      { speaker: "AGENT", text: "Absolutely. I'll send you an official offer letter right now. Can I confirm your email address?" },
      { speaker: "CUSTOMER", text: "Yes, it's on my account." },
      { speaker: "AGENT", text: "Perfect. You'll receive it within five minutes. I really appreciate you giving us the opportunity to retain your business." },
    ],
  },
  {
    type: "follow_up",
    segments: [
      { speaker: "AGENT", text: "Good morning! This is {agent} from InsydOut following up on the quote we sent you last week. Did you get a chance to review it?" },
      { speaker: "CUSTOMER", text: "Yes, I did have a look. I'm still a bit unsure." },
      { speaker: "AGENT", text: "Totally understandable — it's an important decision. What part are you most unsure about? Is it the pricing, the cover, or something else?" },
      { speaker: "CUSTOMER", text: "Mostly the excess amounts. They seem high compared to what I have now." },
      { speaker: "AGENT", text: "That's a great observation. We do offer a reduced excess option — for an additional eighty rand a month, you can halve your standard excess. Would that make the package feel more comfortable?" },
      { speaker: "CUSTOMER", text: "Yes, actually that would help a lot." },
      { speaker: "AGENT", text: "Let me update the quote with the reduced excess option. I'm looking at it now — your new monthly total would be nine hundred and forty rand, which is still a saving of two hundred and sixty rand versus your current policy." },
      { speaker: "CUSTOMER", text: "That sounds much better. How do I proceed?" },
      { speaker: "AGENT", text: "I can send you the updated proposal right now with an acceptance link. It takes about five minutes to complete online, or I can walk you through it on the call. Which do you prefer?" },
      { speaker: "CUSTOMER", text: "Send the link — I'll do it online later today." },
      { speaker: "AGENT", text: "Done! You'll have it in your inbox within two minutes. Is there anything else you'd like me to clarify?" },
      { speaker: "CUSTOMER", text: "No, I think I have everything I need. Thanks." },
      { speaker: "AGENT", text: "Wonderful. I'll follow up tomorrow in case you have any questions after reviewing the proposal. Have a great day!" },
    ],
  },
];

const AGENT_NAMES = ["Sipho Ndlovu", "Thandiwe Mokoena", "Riaan van Wyk", "Fatima Patel"];
const CUSTOMER_NAMES = ["Mr Dlamini", "Ms Botha", "Mrs Khumalo", "Mr Pieterse", "Ms Sithole"];

function seedHash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

function pickDeterministic(arr, seed) {
  return arr[seed % arr.length];
}

export async function transcribe(recording) {
  const seed = seedHash(recording.originalFilename || String(recording.id));
  const scriptIndex = seed % CALL_SCRIPTS.length;
  const script = CALL_SCRIPTS[scriptIndex];
  const agentName = recording.agentName || pickDeterministic(AGENT_NAMES, seed);
  const customerName = pickDeterministic(CUSTOMER_NAMES, (seed >> 4));

  let cursor = 0;
  const segments = script.segments.map((seg, i) => {
    const text = seg.text
      .replace("{agent}", agentName)
      .replace("{customer}", customerName);
    const words = text.split(" ").length;
    const duration = words * 0.55 + 0.4;
    const start = cursor;
    cursor += duration;
    return { id: i + 1, speaker: seg.speaker, start: +start.toFixed(2), end: +cursor.toFixed(2), text };
  });

  const fullText = segments.map(s => `[${s.speaker}]: ${s.text}`).join("\n");

  return {
    provider: "mock",
    language: "en",
    fullText,
    segments,
  };
}
