import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { detectDelimiter, parseCsv } from "./csv.ts";
import { normalisePhone, parseDate, parseNumber } from "./values.ts";
import { detectClientColumns, detectVisitColumns } from "./mapping.ts";
import { importClientsFromCsv, importVisitsFromCsv } from "./importCsv.ts";

describe("csv reader", () => {
  it("detects the semicolon Excel writes in a Russian locale", () => {
    const text = "Имя;Цена\nАман;1 200,50\nMerjen;800,00";
    assert.equal(detectDelimiter(text), ";");
  });

  it("is not fooled by decimal commas into choosing the comma", () => {
    // Every line has one ';' and one ',' — column consistency must decide.
    const text = "Имя;Сумма\nАман;1,50\nSerdar;2,50";
    const t = parseCsv(text);
    assert.equal(t.delimiter, ";");
    assert.deepEqual(t.headers, ["Имя", "Сумма"]);
  });

  it("strips the BOM so the first header is usable", () => {
    const t = parseCsv("﻿Имя,Телефон\nАман,+99365000000");
    assert.deepEqual(t.headers, ["Имя", "Телефон"]);
  });

  it("keeps a delimiter that sits inside a quoted field", () => {
    const t = parseCsv('Имя,Адрес\n"Аннаев, Аман","ул. Мира, 5"');
    assert.deepEqual(t.rows[0], ["Аннаев, Аман", "ул. Мира, 5"]);
  });

  it("handles CRLF endings and doubled quotes", () => {
    const t = parseCsv('A,B\r\n"say ""hi""",2\r\n');
    assert.deepEqual(t.rows[0], ['say "hi"', "2"]);
  });
});

describe("parseDate", () => {
  it("reads day-first dates, the local convention", () => {
    const d = parseDate("03.09.2026");
    assert.equal(d?.getFullYear(), 2026);
    assert.equal(d?.getMonth(), 8); // September, not March
    assert.equal(d?.getDate(), 3);
  });

  it("reads ISO with a time", () => {
    const d = parseDate("2026-09-22 18:30");
    assert.equal(d?.getMonth(), 8);
    assert.equal(d?.getHours(), 18);
  });

  it("reads an Excel serial number", () => {
    // 46000 ≈ 2025-12-05
    const d = parseDate("46000");
    assert.equal(d?.getUTCFullYear(), 2025);
  });

  it("rejects an impossible date instead of rolling it over", () => {
    assert.equal(parseDate("31.02.2026"), null);
  });

  it("returns null on junk", () => {
    assert.equal(parseDate(""), null);
    assert.equal(parseDate("не указано"), null);
  });
});

describe("parseNumber", () => {
  it("reads space thousands with a decimal comma", () => {
    assert.equal(parseNumber("1 200,50"), 1200.5);
  });

  it("reads comma thousands with a decimal point", () => {
    assert.equal(parseNumber("1,200.50"), 1200.5);
  });

  it("treats a lone comma before three digits as thousands", () => {
    assert.equal(parseNumber("1,200"), 1200);
  });

  it("treats a lone comma before two digits as a decimal", () => {
    assert.equal(parseNumber("400,50"), 400.5);
  });

  it("ignores trailing currency words", () => {
    assert.equal(parseNumber("400 манат"), 400);
  });
});

describe("normalisePhone", () => {
  it("matches the same number written two ways", () => {
    assert.equal(normalisePhone("+993 65 12-34-56"), normalisePhone("99365123456"));
  });

  it("rejects something too short to be a number", () => {
    assert.equal(normalisePhone("12"), null);
  });
});

describe("column detection", () => {
  it("picks the specific date column over the generic one", () => {
    const cols = detectClientColumns(["ФИО", "Дата начала", "Дата окончания", "Стоимость"]);
    assert.equal(cols.name, "ФИО");
    assert.equal(cols.membershipStart, "Дата начала");
    assert.equal(cols.membershipEnd, "Дата окончания");
    assert.equal(cols.price, "Стоимость");
  });

  it("copes with English headers", () => {
    const cols = detectClientColumns(["Name", "Phone", "End date", "Price"]);
    assert.equal(cols.name, "Name");
    assert.equal(cols.phone, "Phone");
    assert.equal(cols.membershipEnd, "End date");
  });

  it("never maps one column to two fields", () => {
    const cols = detectClientColumns(["Дата"]);
    const used = Object.values(cols).filter((v) => v !== null);
    assert.equal(new Set(used).size, used.length);
  });

  it("finds the visit timestamp column", () => {
    const cols = detectVisitColumns(["Код клиента", "Дата посещения"]);
    assert.equal(cols.clientRef, "Код клиента");
    assert.equal(cols.at, "Дата посещения");
  });
});

describe("importClientsFromCsv", () => {
  const csv = [
    "Код;ФИО;Телефон;Дата начала;Дата окончания;Стоимость;Зал",
    "1;Аман Аннаев;+993 65 111111;01.09.2026;01.10.2026;400;Центр",
    "2;Merjen Ýazowa;99365222222;15.08.2026;15.11.2026;1 000,00;Центр",
    "3;Serdar Nurыew;99365333333;01.09.2026;01.10.2026;400;Парахат",
  ].join("\n");

  it("imports every valid row and maps the columns", () => {
    const r = importClientsFromCsv(csv);
    assert.equal(r.totalRows, 3);
    assert.equal(r.imported, 3);
    assert.equal(r.skipped.length, 0);
    assert.equal(r.columns.name, "ФИО");
    assert.equal(r.items[1].membershipPrice, 1000);
  });

  it("gives each distinct venue its own id", () => {
    const r = importClientsFromCsv(csv);
    assert.equal(new Set(r.items.map((c) => c.locationId)).size, 2);
    assert.ok(r.warnings.some((w) => w.includes("залов")));
  });

  it("skips rows it cannot use and says which and why", () => {
    const broken = [
      "ФИО;Дата окончания",
      "Аман;01.10.2026",
      ";01.10.2026",
      "Merjen;не указано",
    ].join("\n");

    const r = importClientsFromCsv(broken);
    assert.equal(r.imported, 1);
    assert.equal(r.skipped.length, 2);
    assert.equal(r.skipped[0].row, 3);
    assert.match(r.skipped[0].reason, /имя/);
    assert.match(r.skipped[1].reason, /дата/);
  });

  it("warns when there is no price column rather than silently reporting zero", () => {
    const r = importClientsFromCsv("ФИО;Дата окончания\nАман;01.10.2026");
    assert.ok(r.warnings.some((w) => w.includes("стоимост")));
    assert.equal(r.items[0].membershipPrice, 0);
  });

  it("derives a start date from the end date when the file has none", () => {
    const r = importClientsFromCsv("ФИО;Дата окончания\nАман;01.10.2026", {
      defaultMembershipDays: 30,
      defaultPrice: 400,
      defaultLocationId: "L1",
    });
    const c = r.items[0];
    const days = (c.membershipEnd.getTime() - c.membershipStart.getTime()) / 86_400_000;
    assert.equal(Math.round(days), 30);
  });
});

describe("importVisitsFromCsv", () => {
  const clients = importClientsFromCsv(
    [
      "Код;ФИО;Телефон;Дата окончания;Стоимость",
      "1;Аман Аннаев;+993 65 111111;01.10.2026;400",
      "2;Merjen Ýazowa;99365222222;01.10.2026;400",
    ].join("\n"),
  ).items;

  it("links visits by client id", () => {
    const r = importVisitsFromCsv("Код клиента;Дата посещения\n1;20.09.2026 18:00", clients);
    assert.equal(r.imported, 1);
    assert.equal(r.items[0].clientId, "1");
  });

  it("links visits by phone when the log has no ids", () => {
    const r = importVisitsFromCsv(
      "Телефон;Дата посещения\n+993 65 22-22-22;20.09.2026",
      clients,
    );
    assert.equal(r.imported, 1);
    assert.equal(r.items[0].clientId, "2");
  });

  it("links visits by name as a last resort", () => {
    const r = importVisitsFromCsv("Клиент;Дата\nаман  аннаев;20.09.2026", clients);
    assert.equal(r.imported, 1);
    assert.equal(r.items[0].clientId, "1");
  });

  it("reports unmatched rows instead of dropping them silently", () => {
    const r = importVisitsFromCsv(
      "Код клиента;Дата посещения\n1;20.09.2026\n999;20.09.2026",
      clients,
    );
    assert.equal(r.imported, 1);
    assert.equal(r.skipped.length, 1);
    assert.ok(r.warnings.some((w) => w.includes("сопоставить")));
  });

  it("returns visits in chronological order", () => {
    const r = importVisitsFromCsv(
      "Код;Дата\n1;20.09.2026\n1;18.09.2026\n1;19.09.2026",
      clients,
    );
    const times = r.items.map((v) => v.at.getTime());
    assert.deepEqual(times, [...times].sort((a, b) => a - b));
  });
});
