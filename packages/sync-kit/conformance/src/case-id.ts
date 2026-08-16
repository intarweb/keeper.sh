const conformanceCaseIds = [
  "CONF-O1",
  "CONF-O2",
  "CONF-O3",
  "CONF-O4",
  "CONF-O5",
  "CONF-O6",
  "CONF-O7",
  "CONF-O8",
  "CONF-O9",
  "CONF-O10",
  "CONF-O11",
  "CONF-O12",
  "CONF-O13",
  "CONF-O14",
  "CONF-O15",
  "CONF-O16",
  "CONF-O17",
  "CONF-O18",
  "CONF-O19",
  "CONF-O20",
  "CONF-O21",
  "CONF-O22",
  "CONF-O23",
  "CONF-O24",
  "CONF-O25",
  "CONF-O26",
  "CONF-O27",
  "CONF-O28",
  "CONF-O29",
  "CONF-O30",
  "CONF-O31",
  "CONF-O32",
  "CONF-O33",
  "CONF-O34",
  "CONF-O35",
  "CONF-O36",
  "CONF-O37",
  "CONF-O38",
  "CONF-O39",
  "CONF-O40",
  "CONF-O41",
  "CONF-O42",
  "CONF-O43",
  "CONF-L1",
  "CONF-L2",
  "CONF-L3",
  "CONF-L4",
  "CONF-L5",
  "CONF-L6",
  "CONF-L7",
  "CONF-L8",
  "CONF-L9",
  "CONF-L10",
  "CONF-L11",
  "CONF-L12",
  "CONF-L13",
] as const;

type ConformanceCaseId = (typeof conformanceCaseIds)[number];

type LedgerEntryId = `CONF-I${number}`;

const ledgerEntryOf = (id: ConformanceCaseId): LedgerEntryId => {
  throw new Error(`unimplemented: ledgerEntryOf(${id})`);
};

const caseIdsCitedBy = (entry: LedgerEntryId): readonly ConformanceCaseId[] => {
  throw new Error(`unimplemented: caseIdsCitedBy(${entry})`);
};

export { caseIdsCitedBy, conformanceCaseIds, ledgerEntryOf };
export type { ConformanceCaseId, LedgerEntryId };
