import path from "path";
import fs from "fs";
import puppeteer, { Browser } from "puppeteer-core";
import archiver from "archiver";
import xlsx from "xlsx";
import { EventEmitter } from "events";

const BASE_DIR = path.resolve();
const OUTPUT_DIR = path.join(BASE_DIR, "output");
const TMP_DIR = path.join(BASE_DIR, "tmp");
const TEMPLATES_DIR = path.join(BASE_DIR, "templates");
const LOGOS_DIR = path.join(BASE_DIR, "logos");
const SELOS_DIR = path.join(BASE_DIR, "selos");

export class CardGenerator extends EventEmitter {
  private browser: Browser | null = null;

  async initialize() {
    if (!fs.existsSync(OUTPUT_DIR))
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    if (!fs.existsSync(TMP_DIR))
      fs.mkdirSync(TMP_DIR, { recursive: true });

    this.browser = await puppeteer.launch({
      executablePath:
        process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      headless: true,
    });
  }

  async generateCards(
    excelFilePath: string,
    originalName: string
  ): Promise<string> {
    if (!this.browser) throw new Error("Browser not initialized");

    fs.readdirSync(OUTPUT_DIR).forEach((file) => {
      if (file.endsWith(".pdf") || file.endsWith(".zip")) {
        fs.unlinkSync(path.join(OUTPUT_DIR, file));
      }
    });

    const workbook = xlsx.readFile(excelFilePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: any[] = xlsx.utils.sheet_to_json(sheet, { defval: "" });

    let processed = 0;

    for (const row of rows) {
      const templatePath = path.join(TEMPLATES_DIR, `${row.tipo}.html`);
      if (!fs.existsSync(templatePath)) continue;

      let html = fs.readFileSync(templatePath, "utf8");

      html = html
        .replaceAll("{{TEXTO}}", String(row.texto ?? ""))
        .replaceAll("{{VALOR}}", String(row.valor ?? ""))
        .replaceAll("{{COMPLEMENTO}}", String(row.complemento ?? ""))
        .replaceAll("{{LEGAL}}", String(row.legal ?? ""))
        .replaceAll("{{SEGMENTO}}", String(row.segmento ?? ""))
        .replaceAll("{{CUPOM}}", String(row.cupom ?? ""))
        .replaceAll("{{UF}}", String(row.uf ?? ""))
        .replaceAll("{{URN}}", String(row.urn ?? ""));

      const tmpHtmlPath = path.join(TMP_DIR, `card_${processed + 1}.html`);
      fs.writeFileSync(tmpHtmlPath, html);

      const page = await this.browser.newPage();
      await page.setViewport({ width: 700, height: 1058 });
      await page.goto(`file://${tmpHtmlPath}`, { waitUntil: "networkidle0" });

      const pdfPath = path.join(OUTPUT_DIR, `${processed + 1}.pdf`);

      await page.pdf({
        path: pdfPath,
        width: "700px",
        height: "1058px",
        printBackground: true,
      });

      await page.close();
      processed++;
    }

    // 🔥 ZIP COM MESMO NOME DA PLANILHA
    const baseName = path.parse(originalName).name;
    const zipPath = path.join(OUTPUT_DIR, `${baseName}.zip`);

    const output = fs.createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    archive.pipe(output);

    fs.readdirSync(OUTPUT_DIR).forEach((file) => {
      if (file.endsWith(".pdf")) {
        archive.file(path.join(OUTPUT_DIR, file), { name: file });
      }
    });

    await archive.finalize();

    return zipPath;
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
