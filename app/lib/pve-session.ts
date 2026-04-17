export const PVE_SESSION_COOKIE = "pve-session";

export interface PveSession {
  ticket: string;
  csrfToken: string;
  username: string;
}

export function parsePveSession(value: string | undefined): PveSession | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value);

    if (
      typeof parsed === "object"
      && parsed !== null
      && typeof parsed.ticket === "string"
      && typeof parsed.csrfToken === "string"
      && typeof parsed.username === "string"
    ) {
      return parsed satisfies PveSession;
    }
  } catch {
    return null;
  }

  return null;
}
