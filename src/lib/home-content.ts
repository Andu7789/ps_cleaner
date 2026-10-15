// All the wording on the homepage lives here so the owner can change it
// in one place. Everything below is placeholder copy written for the demo.
export const HOME_COPY = {
  hero: {
    headline: "Come home to a house that feels freshly cared for",
    sub: "Friendly, vetted cleaners, honest prices and a booking that takes a couple of minutes. Pick a clean, pick a time, and we take it from there.",
    secondaryCta: "See our cleans",
    imageAlt: "A bright living room with a grey sofa, wooden side tables and fresh plants, tidy and calm",
  },
  quickBook: {
    title: "Book in under two minutes",
    hint: "Choose a clean to see what's included",
    cta: "Choose a time",
  },
  trust: [
    { title: "Fully insured", text: "Every clean is covered, so you never have to worry." },
    { title: "Vetted cleaners", text: "Background checked and trained to our standard." },
    { title: "Happiness guarantee", text: "Not delighted? We will come back and put it right." },
    { title: "Pay securely online", text: "No cash, no chasing. Pay when you book." },
  ],
  services: {
    heading: "Pick a clean, we'll do the rest",
    sub: "Clear prices up front. Choose the one that fits, then pick a time that suits you.",
    featuredLead: "Our most popular first step",
    cardCta: "Book your appointment",
  },
  how: {
    heading: "How it works",
    imageAlt: "A cleaner in yellow gloves wiping down a wooden shelf",
    steps: [
      { title: "Book a free walkthrough", text: "A short visit so we can see your home and learn what matters most to you." },
      { title: "Get a fixed price", text: "We confirm a clear price before anything is charged. No surprises." },
      { title: "Relax while we clean", text: "Your cleaner arrives on time with everything needed. You come home to the result." },
    ],
  },
  standard: {
    heading: "The white glove standard",
    sub: "It's the small things people notice. These are the habits that set our cleans apart.",
    imageAlt: "Someone vacuuming a bright loft living room with the music on, plants and a soft green throw on the sofa",
    points: [
      "The same friendly cleaner where possible, so they get to know your home",
      "Checklists for every room, so nothing gets missed",
      "Eco friendly products, safe for children and pets",
      "A quick check with you at the end, before we leave",
    ],
  },
  faq: {
    heading: "Good questions",
    items: [
      { q: "Do I need to be at home?", a: "No. Many customers leave a key or access details with us. Tell us how you would like to do it when you book." },
      { q: "Do you bring your own supplies?", a: "Yes. Your cleaner arrives with products and equipment. If you prefer we use yours, just let us know." },
      { q: "What if I need to change my booking?", a: "You can cancel or rearrange from your account. Please give us as much notice as you can." },
      { q: "How do I pay?", a: "Securely online when you book. For clean types that need a quote, you pay once we have confirmed the price." },
      { q: "Can I have the same cleaner every time?", a: "We always try. Once you set up a regular clean we keep the same person on your home wherever we can." },
    ],
  },
  closing: {
    heading: "Ready when you are",
    sub: "Your next clean can be booked in the time it takes to make a cup of tea.",
  },
} as const;
