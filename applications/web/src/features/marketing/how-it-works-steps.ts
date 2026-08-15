export type HowItWorksStep = {
  title: string;
  body: string;
};

// Shared by the homepage and /features so the two never drift apart on what
// setting a connection up actually involves.
export const HOW_IT_WORKS_STEPS: HowItWorksStep[] = [
  {
    title: "Connect a calendar, then say where it copies to",
    body: "Connect a calendar with a sign-in or a pasted link, then choose which calendar its events copy into.",
  },
  {
    title: "Choose what each calendar shows",
    body: "By default a copy shows only the name of the calendar it came from. On Pro you set that per calendar.",
  },
  {
    title: "Keeper.sh takes it from there",
    body: "Your calendars are checked every minute. Changes reach your other calendars within 30 minutes on Free, a minute on Pro.",
  },
];
