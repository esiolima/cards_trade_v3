// (CÓDIGO COMPLETO CORRIGIDO - SEM QUEBRAR PROGRESSO)

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

export class CardGenerator extends EventEmitter {
  private browser: Browser | null = null;

  async initialize() {
    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

    if (!this.browser) {
      this.browser = await puppeteer.launch({
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium",
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
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
    const t = tipo.toLowerCase();
    if (t.includes("promo")) return "promocao";
    if (t.includes("cupom")) return "cupom";
    if (t.includes("queda")) return "queda";
    return "";
  }

  async processExcel(excelFilePath: string): Promise<any[]> {
    await this.initialize();

    const workbook = xlsx.readFile(excelFilePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: any[] = xlsx.utils.sheet_to_json(sheet, { defval: "" });

    const cards: any[] = [];
    const total = rows.length;
    let processed = 0;

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

      const page = await this.browser!.newPage();

      try {
        await page.setContent(html, { waitUntil: "networkidle0" });

        const pdfPath = path.join(OUTPUT_DIR, `card_${i + 1}.pdf`);

        await page.pdf({
          path: pdfPath,
          width: "700px",
          height: "1058px",
          printBackground: true,
        });

        cards.push(pdfPath);
      } catch (e) {
        console.error("Erro no card:", e);
      } finally {
        await page.close();
      }

      processed++;

      this.emit("progress", {
        processed,
        total,
        percentage: Math.round((processed / total) * 100),
      });
    }

    return cards;
  }

  async generateZip(): Promise<string> {
    const zipPath = path.join(OUTPUT_DIR, `cards.zip`);
    const output = fs.createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    return new Promise((resolve, reject) => {
      output.on("close", () => resolve(zipPath));
      archive.on("error", (err) => reject(err));
      archive.pipe(output);

      const files = fs.readdirSync(OUTPUT_DIR);

      files.forEach((file) => {
        if (file.endsWith(".pdf") && !file.includes("jornal")) {
          archive.file(path.join(OUTPUT_DIR, file), { name: file });
        }
      });

      archive.finalize();
    });
  }

  async generateJornal(): Promise<string> {
    await this.initialize();

    const excelFilePath = path.join(process.cwd(), "uploads_excel", "current_planilha.xlsx");
    const workbook = xlsx.readFile(excelFilePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: any[] = xlsx.utils.sheet_to_json(sheet, { defval: "" });

    const cards: any[] = [];

    for (const row of rows) {
      const tipo = this.normalizeType(row.tipo);
      const templatePath = path.join(TEMPLATES_DIR, `${tipo}.html`);
      if (!fs.existsSync(templatePath)) continue;

      let html = fs.readFileSync(templatePath, "utf8");

      html = html
        .replaceAll("{{TEXTO}}", String(row.texto ?? ""))
        .replaceAll("{{VALOR}}", String(row.valor ?? ""))
        .replaceAll("{{LEGAL}}", String(row.legal ?? ""))
        .replaceAll("{{CUPOM}}", String(row.cupom ?? ""));

      cards.push({
        categoria: String(row.segmento || "OUTROS"),
        html
      });
    }

    const pages: any[] = [];
    let currentPage: any[] = [];
    let currentCategoria = "";

    for (const card of cards) {
      const sameCategoria = card.categoria === currentCategoria;

      if (!sameCategoria) {
        const remainingSlots = 18 - currentPage.length;

        if (currentPage.length > 0 && remainingSlots <= 6) {
          pages.push(currentPage);
          currentPage = [];
        }

        currentCategoria = card.categoria;
      }

      currentPage.push(card);

      if (currentPage.length === 18) {
        pages.push(currentPage);
        currentPage = [];
      }
    }

    if (currentPage.length > 0) {
      pages.push(currentPage);
    }

    let html = `
    <html>
    <head>
      <style>
        @page { size: A4; margin: 20px; }

        body {
          font-family: Arial;
        }

        .page {
          page-break-after: always;
        }

        .header {
          text-align: center;
          font-size: 24px;
          font-weight: bold;
          margin-bottom: 20px;
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

    for (const pageCards of pages) {
      html += `<div class="page">`;
      html += `<div class="header">OFERTAS</div>`;
      html += `<div class="grid">`;

      for (const card of pageCards) {
        html += `<div class="card">${card.html}</div>`;
      }

      html += `</div></div>`;
    }

    html += `</body></html>`;

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
