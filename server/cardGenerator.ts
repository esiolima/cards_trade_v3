// ARQUIVO COMPLETO CORRIGIDO (BASEADO NO SEU ORIGINAL)

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
    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

    if (!this.browser) {
      this.browser = await puppeteer.launch({
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium",
        args: ["--no-sandbox","--disable-setuid-sandbox"],
        headless: true,
      });
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  normalizeType(tipo: string): string {
    if (!tipo) return "";
    const normalized = String(tipo).toLowerCase();
    if (normalized.includes("promo")) return "promocao";
    if (normalized.includes("cupom")) return "cupom";
    if (normalized.includes("queda")) return "queda";
    return "";
  }

  imageToBase64(imagePath: string): string {
    if (!imagePath || !fs.existsSync(imagePath)) return "";
    const ext = path.extname(imagePath).replace(".", "");
    const buffer = fs.readFileSync(imagePath);
    return `data:image/${ext};base64,${buffer.toString("base64")}`;
  }

  async processExcel(excelFilePath: string): Promise<any[]> {
    await this.initialize();

    const workbook = xlsx.readFile(excelFilePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: any[] = xlsx.utils.sheet_to_json(sheet, { defval: "" });

    const cards: any[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      const tipo = this.normalizeType(row.tipo);
      if (!tipo) continue;

      const templatePath = path.join(TEMPLATES_DIR, `${tipo}.html`);
      if (!fs.existsSync(templatePath)) continue;

      let html = fs.readFileSync(templatePath, "utf8");

      html = html
        .replaceAll("{{TEXTO}}", String(row.texto ?? ""))
        .replaceAll("{{VALOR}}", String(row.valor ?? ""))
        .replaceAll("{{LEGAL}}", String(row.legal ?? ""))
        .replaceAll("{{CUPOM}}", String(row.cupom ?? ""));

      const tmpHtml = path.join(TMP_DIR, `card_${i}.html`);
      fs.writeFileSync(tmpHtml, html);

      const page = await this.browser!.newPage();

      await page.goto(`file://${tmpHtml}`, { waitUntil: "networkidle0" });

      const pdfPath = path.join(OUTPUT_DIR, `card_${i}.pdf`);

      await page.pdf({
        path: pdfPath,
        width: "700px",
        height: "1058px",
        printBackground: true,
      });

      await page.close();

      cards.push({ html, categoria: row.segmento || "OUTROS" });
    }

    return cards;
  }

  async generateZip(): Promise<string> {
    const zipPath = path.join(OUTPUT_DIR, "cards.zip");
    const output = fs.createWriteStream(zipPath);
    const archive = archiver("zip");

    archive.pipe(output);

    fs.readdirSync(OUTPUT_DIR).forEach(file => {
      if (file.endsWith(".pdf") && !file.includes("jornal")) {
        archive.file(path.join(OUTPUT_DIR, file), { name: file });
      }
    });

    await archive.finalize();

    return zipPath;
  }

  async generateJornal(): Promise<string> {
    await this.initialize();

    const excelFilePath = path.join(process.cwd(), "uploads_excel", "current_planilha.xlsx");

    // 👉 REUTILIZA O PROCESSAMENTO REAL
    const cards = await this.processExcel(excelFilePath);

    let html = `
    <html>
    <head>
      <style>
        @page { size: A4; margin: 20px; }

        .page {
          page-break-after: always;
        }

        .grid {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }

        .card {
          width: 32%;
        }
      </style>
    </head>
    <body>
    `;

    let currentPageCount = 0;

    html += `<div class="page"><div class="grid">`;

    for (const card of cards) {
      html += `<div class="card">${card.html}</div>`;
      currentPageCount++;

      if (currentPageCount === 18) {
        html += `</div></div><div class="page"><div class="grid">`;
        currentPageCount = 0;
      }
    }

    html += `</div></div></body></html>`;

    const filePath = path.join(OUTPUT_DIR, "jornal_ofertas.pdf");

    const page = await this.browser!.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    await page.pdf({
      path: filePath,
      format: "A4",
      printBackground: true,
    });

    return filePath;
  }
}
