import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const rootDir = process.cwd();
const csvPath = path.join(rootDir, "data", "country_codes.csv");
const outputDir = path.join(rootDir, "outputs");
const xlsxPath = path.join(outputDir, "country_codes.xlsx");
const previewPath = path.join(outputDir, "country_codes_preview.png");

await fs.mkdir(outputDir, { recursive: true });

const csvText = (await fs.readFile(csvPath, "utf8")).replace(/^\uFEFF/, "");
const workbook = await Workbook.fromCSV(csvText, { sheetName: "Country Codes" });
const sheet = workbook.worksheets.getItem("Country Codes");

sheet.showGridLines = false;
sheet.freezePanes.freezeRows(1);

const rowCount = csvText.trimEnd().split(/\r?\n/).length;
const tableRange = `A1:F${rowCount}`;
const usedRange = sheet.getRange(tableRange);

usedRange.format = {
  font: { name: "Aptos", size: 10, color: "#111827" },
  borders: { preset: "inside", style: "thin", color: "#E5E7EB" },
};

sheet.getRange("A1:F1").format = {
  fill: "#1F6F78",
  font: { name: "Aptos", size: 10, bold: true, color: "#FFFFFF" },
  horizontalAlignment: "center",
};

sheet.getRange(`A2:C${rowCount}`).format.horizontalAlignment = "left";
sheet.getRange(`D2:D${rowCount}`).format.horizontalAlignment = "right";
sheet.getRange(`E2:E${rowCount}`).format.horizontalAlignment = "left";
sheet.getRange(`F2:F${rowCount}`).format.horizontalAlignment = "center";

sheet.getRange("A:A").format.columnWidth = 18;
sheet.getRange("B:B").format.columnWidth = 24;
sheet.getRange("C:C").format.columnWidth = 30;
sheet.getRange("D:D").format.columnWidth = 14;
sheet.getRange("E:E").format.columnWidth = 48;
sheet.getRange("F:F").format.columnWidth = 14;
sheet.getRange(`E2:E${rowCount}`).format.wrapText = true;

const table = sheet.tables.add(tableRange, true, "CountryCodes");
table.style = "TableStyleMedium2";
table.showFilterButton = true;

const preview = await workbook.render({
  sheetName: "Country Codes",
  range: "A1:F20",
  scale: 1,
  format: "png",
});
await fs.writeFile(previewPath, new Uint8Array(await preview.arrayBuffer()));

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(xlsxPath);

const inspect = await workbook.inspect({
  kind: "table",
  range: "A1:F10",
  tableMaxRows: 10,
  tableMaxCols: 6,
  maxChars: 3000,
});
console.log(inspect.ndjson);
console.log(JSON.stringify({ rowCount: rowCount - 1, xlsxPath, previewPath }));
