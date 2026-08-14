export type TestimonialSource = "reddit" | "x" | "email";

export type Testimonial = {
  quote: string;
  author: string;
  handle: string | null;
  source: TestimonialSource;
};

export const TESTIMONIAL_SOURCE_LABELS: Record<TestimonialSource, string> = {
  reddit: "Reddit",
  x: "X",
  email: "Email",
};

// Placeholders, so the section can be reviewed before real quotes exist. The
// maintainer replaces each entry with a real quote sourced from Reddit, X or
// user email. The section does not render while this array is empty.
export const TESTIMONIALS: Testimonial[] = [
  {
    quote: "PLACEHOLDER QUOTE — a real Reddit comment about Keeper.sh goes here.",
    author: "PLACEHOLDER",
    handle: "u/placeholder",
    source: "reddit",
  },
  {
    quote: "PLACEHOLDER QUOTE — a real post from X about Keeper.sh goes here.",
    author: "PLACEHOLDER",
    handle: "@placeholder",
    source: "x",
  },
  {
    quote: "PLACEHOLDER QUOTE — a real line from a user email about Keeper.sh goes here.",
    author: "PLACEHOLDER",
    handle: null,
    source: "email",
  },
];
