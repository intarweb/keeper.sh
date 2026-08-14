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

export const TESTIMONIALS: Testimonial[] = [
  {
    quote: "PLACEHOLDER — replace with a real quote.",
    author: "PLACEHOLDER",
    handle: "u/placeholder",
    source: "reddit",
  },
  {
    quote: "PLACEHOLDER — replace with a real quote.",
    author: "PLACEHOLDER",
    handle: "@placeholder",
    source: "x",
  },
  {
    quote: "PLACEHOLDER — replace with a real quote.",
    author: "PLACEHOLDER",
    handle: null,
    source: "email",
  },
];
