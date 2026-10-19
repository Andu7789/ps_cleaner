// All the wording on the homepage lives here so the owner can change it
// in one place. Everything below is placeholder copy written for the demo.
export const HOME_COPY = {
  hero: {
    headline: "Tailored cleaning, just for you",
    sub: "Friendly, vetted cleaners, honest prices and a booking that takes a couple of minutes. Pick a clean, pick a time, and we take it from there.",
    secondaryCta: "See our cleans",
    imageAlt: "A bright living room with a grey sofa, wooden side tables and fresh plants, tidy and calm",
  },
  returning: { button: "Returning customer" },
  quickBook: {
    title: "Book in under two minutes",
    hint: "Choose a clean to see what's included",
    cta: "Choose a time",
  },
  trust: [
    { title: "Fully insured", text: "Every clean is covered, so you never have to worry." },
    { title: "Vetted cleaners", text: "Background checked and trained to our standard." },
    { title: "Happiness guarantee", text: "Not delighted? We will come back and put it right." },
    { title: "No upfront payment", text: "Nothing to pay when you book. We invoice you once the clean is done." },
  ],
  services: {
    heading: "Pick a clean, we'll do the rest",
    sub: "Clear prices up front. Choose the one that fits, then pick a time that suits you.",
    featuredLead: "Our most popular first step",
    cardCta: "Book your clean",
    featuredCta: "Book your appointment",
  },
  how: {
    heading: "How it works",
    imageAlt: "A cleaner in yellow gloves wiping down a wooden shelf",
    steps: [
      { title: "Book a free walkthrough", text: "A short visit so we can see your home and learn what matters most to you." },
      { title: "Get your quote", text: "We email you a clear quote before your first clean. No surprises." },
      { title: "Relax while we clean", text: "Your cleaner arrives on time with everything needed. You come home to the result." },
    ],
  },
  standard: {
    // Shown after the company name, e.g. "Shine Bright standard".
    headingSuffix: "standard",
    sub: "It's the small things people notice. These are the habits that set our cleans apart.",
    imageAlt: "Someone vacuuming a bright loft living room with the music on, plants and a soft green throw on the sofa",
    points: [
      "The same friendly cleaner where possible, so they get to know your home",
      "Checklists for every room, so nothing gets missed",
      "Eco-conscious cleaning using non-harsh products",
      "A quick check with you at the end, before we leave",
    ],
  },
  faq: {
    heading: "Frequently asked questions",
    items: [
      { q: "Do I need to be at home?", a: "No. Many customers choose to leave us a key or provide access details so we can clean at a convenient time. We are happy to act as key holders for regular clients. Simply let us know your preferred access arrangements and we'll discuss the best option for you." },
      { q: "Do you bring your own supplies?", a: "Yes. Your cleaner arrives with all the necessary products and equipment. If you have a preference for specific cleaning products, just let us know and we can discuss the options available." },
      { q: "What if I need to change my booking?", a: "Press Amend existing booking at the top of the page and enter the booking reference from your confirmation email to pick a new date and time. Please give us as much notice as you can." },
      { q: "How do I pay?", a: "There is nothing to pay when you book. We send you an invoice once your clean is complete." },
      { q: "Can I have the same cleaner every time?", a: "We aim to provide you with the same cleaner for every visit, building consistency and familiarity in your home wherever possible." },
    ],
  },
  closing: {
    heading: "Ready when you are",
    sub: "Your next clean can be booked in the time it takes to make a cup of tea.",
  },
} as const;
