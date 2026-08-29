import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const input = process.argv[2] || ".local/dm-card-images.jsonl";
const outputDirectory = process.argv[3] || ".local/dm-card-image-sql";
const chunkSize = 500;
const rows = (await readFile(input, "utf8")).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
const text = (value) => `'${String(value).replaceAll("'", "''")}'`;
await mkdir(outputDirectory, { recursive: true });
const outputs = [];
for (let index = 0; index < rows.length; index += chunkSize) {
  const values = rows.slice(index, index + chunkSize).map((row) => `(${text(row.official_card_id)},${text(row.image_key)},${Number(row.width)},${Number(row.height)},${Number(row.byte_size)})`).join(",\n");
  const sql = `update public.card_prints as prints\nset image_key=data.image_key,image_width=data.width,image_height=data.height,image_byte_size=data.byte_size,image_updated_at=pg_catalog.now()\nfrom (values\n${values}\n) as data(official_card_id,image_key,width,height,byte_size)\nwhere prints.official_card_id=data.official_card_id;\n`;
  const output = path.join(outputDirectory, `card-images-${String(outputs.length + 1).padStart(3, "0")}.sql`);
  await writeFile(output, sql);
  outputs.push(output);
}
console.log(JSON.stringify({ rows: rows.length, chunks: outputs.length, outputDirectory }, null, 2));
