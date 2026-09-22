/**
 * Work out which spreadsheet column holds which field.
 *
 * Nobody's export uses the names we would pick, and at a meeting there is no
 * time to explain a required format. So headers are matched against aliases in
 * the languages these files actually arrive in, and whatever cannot be matched
 * is reported rather than guessed at.
 */

export type ClientField =
  | "id"
  | "name"
  | "phone"
  | "membershipStart"
  | "membershipEnd"
  | "price"
  | "membershipDays"
  | "location";

export type VisitField = "clientRef" | "at";

/** Longer, more specific aliases first — "дата окончания" must beat "дата". */
const CLIENT_ALIASES: Record<ClientField, string[]> = {
  id: ["id", "код", "кодклиента", "номерклиента", "clientid", "№"],
  name: ["фио", "фамилияимя", "имяклиента", "клиент", "имя", "name", "fullname", "ady", "at"],
  phone: ["номертелефона", "телефон", "тел", "моб", "мобильный", "phone", "mobile", "telefon"],
  membershipStart: [
    "датаначала", "началоабонемента", "датапокупки", "датаоплаты", "начало",
    "start", "startdate", "başlangyç", "с",
  ],
  membershipEnd: [
    "датаокончания", "окончаниеабонемента", "действуетдо", "срокдо", "активендо",
    "окончание", "истекает", "end", "enddate", "expiry", "expires", "valid", "до",
  ],
  price: ["стоимость", "ценаабонемента", "сумма", "оплата", "цена", "price", "amount", "tölegi", "töleg"],
  membershipDays: ["срокдней", "количестводней", "длительность", "период", "дней", "days", "duration"],
  location: ["зал", "филиал", "точка", "клуб", "отделение", "location", "branch", "club"],
};

const VISIT_ALIASES: Record<VisitField, string[]> = {
  clientRef: [
    "кодклиента", "номерклиента", "clientid", "id", "код", "фио", "клиент", "имя",
    "телефон", "phone", "name",
  ],
  at: [
    "датапосещения", "датаивремя", "датавизита", "времяпосещения", "посещение",
    "визит", "проход", "дата", "время", "visit", "checkin", "datetime", "date", "time",
  ],
};

/** lowercase, strip everything but letters and digits */
function normalise(header: string): string {
  return header.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

function scoreHeader(header: string, aliases: string[]): number {
  const h = normalise(header);
  if (h === "") return 0;
  for (let i = 0; i < aliases.length; i++) {
    const a = aliases[i];
    // Earlier aliases are more specific, so they score higher.
    const specificity = aliases.length - i;
    if (h === a) return 1000 + specificity;
    if (h.startsWith(a) || h.endsWith(a)) return 500 + specificity;
    if (h.includes(a) && a.length >= 3) return 100 + specificity;
  }
  return 0;
}

/**
 * Assign headers to fields, best match first, never reusing a header.
 * Returns the chosen header name per field, or null when nothing matched.
 */
function detect<F extends string>(
  headers: string[],
  aliases: Record<F, string[]>,
): Record<F, string | null> {
  const fields = Object.keys(aliases) as F[];

  const candidates: { field: F; header: string; index: number; score: number }[] = [];
  for (const field of fields) {
    headers.forEach((header, index) => {
      const score = scoreHeader(header, aliases[field]);
      if (score > 0) candidates.push({ field, header, index, score });
    });
  }
  candidates.sort((a, b) => b.score - a.score);

  const result = Object.fromEntries(fields.map((f) => [f, null])) as Record<F, string | null>;
  const usedHeaders = new Set<number>();
  const filledFields = new Set<F>();

  for (const c of candidates) {
    if (filledFields.has(c.field) || usedHeaders.has(c.index)) continue;
    result[c.field] = c.header;
    filledFields.add(c.field);
    usedHeaders.add(c.index);
  }

  return result;
}

export function detectClientColumns(headers: string[]): Record<ClientField, string | null> {
  return detect(headers, CLIENT_ALIASES);
}

export function detectVisitColumns(headers: string[]): Record<VisitField, string | null> {
  return detect(headers, VISIT_ALIASES);
}
