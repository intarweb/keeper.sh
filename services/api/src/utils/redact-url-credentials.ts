const redactUrlCredentials = (value: string | null): string | null => {
  if (!value) {
    return value;
  }
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
};

export { redactUrlCredentials };
