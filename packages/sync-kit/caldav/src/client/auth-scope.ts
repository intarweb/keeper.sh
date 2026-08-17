const authVerdicts = ["authenticated", "denied", "undecided"] as const;
type AuthVerdict = (typeof authVerdicts)[number];

interface AuthScope {
  readonly record: (status: number) => void;
  readonly recordWithheldCredentials: () => void;
  readonly verdict: () => AuthVerdict;
  readonly credentialsWithheld: () => boolean;
}

const successful = (status: number): boolean => status >= 200 && status < 300;

const deniedStatus = 401;

const createAuthScope = (): AuthScope => {
  let succeeded = false;
  let denied = false;
  let withheld = false;

  return {
    record: (status: number) => {
      if (successful(status)) {
        succeeded = true;
        withheld = false;
        return;
      }
      if (status === deniedStatus) {
        denied = true;
      }
    },
    recordWithheldCredentials: () => {
      withheld = true;
    },
    verdict: () => {
      if (succeeded) {
        return "authenticated";
      }
      if (denied) {
        return "denied";
      }
      return "undecided";
    },
    credentialsWithheld: () => withheld,
  };
};

export { authVerdicts, createAuthScope };
export type { AuthScope, AuthVerdict };
