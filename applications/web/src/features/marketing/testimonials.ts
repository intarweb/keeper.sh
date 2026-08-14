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

// Real quotes only. Sourced from Reddit, X and user email by the maintainer.
// The section does not render while this is empty, so an unfinished placeholder
// can never reach the page.
export const TESTIMONIALS: Testimonial[] = [];
