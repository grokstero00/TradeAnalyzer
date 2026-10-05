/**
 * Write the generated chain out as CSV files that look like a real export:
 * semicolon-separated, day-first dates, Russian headers, a price column with
 * a currency word in it. Used to exercise the importer end to end, and as
 * sample files to hand someone who asks "what format do you need?".
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { generateSeedData } from "./seed.ts";

const { locations, clients, visits } = generateSeedData();
const nameOf = new Map(locations.map((l) => [l.id, l.name]));
const ru = (d: Date) =>
  `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;

mkdirSync("sample", { recursive: true });

writeFileSync(
  "sample/clients.csv",
  "﻿" +
    ["Код;ФИО;Телефон;Дата начала;Дата окончания;Стоимость;Зал"]
      .concat(
        clients.map((c) =>
          [
            c.id,
            c.name,
            c.phone,
            ru(c.membershipStart),
            ru(c.membershipEnd),
            `${c.membershipPrice} манат`,
            nameOf.get(c.locationId) ?? c.locationId,
          ].join(";"),
        ),
      )
      .join("\r\n"),
  "utf8",
);

writeFileSync(
  "sample/visits.csv",
  "﻿" +
    ["Код клиента;Дата посещения"]
      .concat(visits.map((v) => `${v.clientId};${ru(v.at)} ${String(v.at.getHours()).padStart(2, "0")}:${String(v.at.getMinutes()).padStart(2, "0")}`))
      .join("\r\n"),
  "utf8",
);

console.log(`sample/clients.csv — ${clients.length} строк`);
console.log(`sample/visits.csv  — ${visits.length} строк`);
