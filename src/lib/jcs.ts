export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

function assertValidString(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new Error("JCS_INVALID_UNICODE");
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new Error("JCS_INVALID_UNICODE");
    }
  }
}

export function canonicalize(value: JsonValue): string {
  if (value === null || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("JCS_INVALID_NUMBER");
    return JSON.stringify(value);
  }
  if (typeof value === "string") {
    assertValidString(value);
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => {
    assertValidString(key);
    return `${JSON.stringify(key)}:${canonicalize(value[key])}`;
  }).join(",")}}`;
}

export async function sha256Base64Url(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Buffer.from(digest).toString("base64url");
}
