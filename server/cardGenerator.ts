// MESMO INÍCIO — NÃO ALTERADO
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
        args: ["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage","--disable-gpu"],
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
    const normalized = String(tipo).toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (normalized.includes("promo")) return "promocao";
    if (normalized.includes("cupom")) return "cupom";
    if (normalized.includes("queda")) return "queda";
    if (normalized.includes("cashback")) return "cashback";
    if (normalized === "bc") return "bc";
    return "";
  }

  imageToBase64(imagePath: string): string {
    if (!imagePath || !fs.existsSync(imagePath)) return "";
    const ext = path.extname(imagePath).replace(".", "").toLowerCase();
    const buffer = fs.readFileSync(imagePath);
    return `data:image/${ext};base64,${buffer.toString("base64")}`;
  }

  async generateJornal(): Promise<string> {
    await this.initialize();

    const excelFilePath = path.join(process.cwd(), "uploads_excel", "current_planilha.xlsx");
    const workbook = xlsx.readFile(excelFilePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: any[] = xlsx.utils.sheet_to_json(sheet, { defval: "" });

    let html = `
    <html>
    <head>
      <style>
        @page {
          size: A4;
          margin: 20px;
        }

        body {
          font-family: Arial;
        }

        .categoria {
          page-break-before: always;
        }

        .grid {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }

        .card {
          width: 32%;
          page-break-inside: avoid;
        }
      </style>
    </head>
    <body>
    `;

    let currentCategoria = "";

    for (const row of rows) {
      const categoria = row.segmento || "OUTROS";

      if (categoria !== currentCategoria) {
        if (currentCategoria !== "") {
          html += `</div></div>`;
        }

        html += `
        <div class="categoria">
          <h2>${categoria}</h2>
          <div class="grid">
        `;

        currentCategoria = categoria;
      }

      const tipo = this.normalizeType(row.tipo);
      const templatePath = path.join(TEMPLATES_DIR, `${tipo}.html`);
      if (!fs.existsSync(templatePath)) continue;

      let cardHtml = fs.readFileSync(templatePath, "utf8");

      cardHtml = cardHtml
        .replaceAll("{{TEXTO}}", row.texto || "")
        .replaceAll("{{VALOR}}", row.valor || "")
        .replaceAll("{{LEGAL}}", row.legal || "")
        .replaceAll("{{CUPOM}}", row.cupom || "");

      html += `<div class="card">${cardHtml}</div>`;
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
