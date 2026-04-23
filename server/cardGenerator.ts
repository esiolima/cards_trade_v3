import path from "path";
import fs from "fs";
import puppeteer, { Browser } from "puppeteer-core";
import archiver from "archiver";
import xlsx from "xlsx";
import { EventEmitter } from "events";

const BASE_DIR = path.resolve();
const OUTPUT_DIR = path.join(BASE_DIR, "output");
const TMP_DIR = path.join(BASE_DIR, "tmp");
const IMG_DIR = path.join(BASE_DIR, "tmp_img");
const JORNAL_MANIFEST_PATH = path.join(TMP_DIR, "jornal_manifest.json");

const TEMPLATES_DIR = path.join(BASE_DIR, "templates");
const LOGOS_DIR = path.join(BASE_DIR, "logos");
const SELOS_DIR = path.join(BASE_DIR, "selos");
const CARD_WIDTH = 700;
const CARD_HEIGHT = 1058;

export class CardGenerator extends EventEmitter {
  private browser: Browser | null = null;
  private uploadedSpreadsheetBaseName = "jornal_ofertas";

  normalizeRowKey(key: unknown): string {
    return String(key ?? "")
      .replace(/^\uFEFF/, "")
      .toLowerCase()
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  getRowValue(row: Record<string, unknown>, ...aliases: string[]): string {
    const normalizedAliases = aliases.map((alias) => this.normalizeRowKey(alias));
    const matchedKey = Object.keys(row).find((key) =>
      normalizedAliases.includes(this.normalizeRowKey(key))
    );

    if (!matchedKey) return "";
    return String(row[matchedKey] ?? "").trim();
  }

  sanitizeFilePart(value: string, fallback = "sem_valor"): string {
    const sanitized = String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/_+/g, "_");

    return sanitized || fallback;
  }

  sanitizeSpreadsheetBaseName(value: string, fallback = "jornal_ofertas"): string {
    const cleaned = String(value ?? "")
      .replace(/[\\/:*?"<>|]/g, "")
      .trim();
    return cleaned || fallback;
  }

  pickBannerColor(previousColor?: string): string {
    const palette = [
      "#B91C1C",
      "#047857",
      "#1D4ED8",
      "#7C3AED",
      "#C2410C",
      "#0F766E",
      "#BE185D",
      "#374151",
    ];

    if (palette.length === 1) return palette[0];

    const candidates = palette.filter((color) => color !== previousColor);
    const index = Math.floor(Math.random() * candidates.length);
    return candidates[index] ?? palette[0];
  }

  async initialize() {
    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
    if (!fs.existsSync(IMG_DIR)) fs.mkdirSync(IMG_DIR, { recursive: true });

    this.browser = await puppeteer.launch({
      executablePath:
        process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      headless: true,
    });
  }

  normalizeType(tipo: string): string {
    if (!tipo) return "";

    const normalized = String(tipo)
      .toLowerCase()
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    if (normalized.includes("promo")) return "promocao";
    if (normalized.includes("cupom")) return "cupom";
    if (normalized.includes("queda")) return "queda";
    if (normalized.includes("bc")) return "bc";

    return "";
  }

  imageToBase64(imagePath: string): string {
    if (!imagePath || !fs.existsSync(imagePath)) return "";
    const ext = path.extname(imagePath).replace(".", "");
    const buffer = fs.readFileSync(imagePath);
    return `data:image/${ext};base64,${buffer.toString("base64")}`;
  }

  async generateCards(excelFilePath: string): Promise<string> {
    if (!this.browser) throw new Error("Browser not initialized");

    fs.readdirSync(OUTPUT_DIR).forEach((file) => {
      if (file.endsWith(".pdf") || file.endsWith(".zip")) {
        fs.unlinkSync(path.join(OUTPUT_DIR, file));
      }
    });

    const workbook = xlsx.readFile(excelFilePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: any[] = xlsx.utils.sheet_to_json(sheet, { defval: "" });

    const total = rows.length;
    let processed = 0;
    const manifestEntries: Array<{ imageFile: string; categoria: string }> = [];

    for (const row of rows) {
      const tipo = this.normalizeType(row.tipo);
      if (!tipo) continue;

      const templatePath = path.join(TEMPLATES_DIR, `${tipo}.html`);
      if (!fs.existsSync(templatePath)) continue;

      let html = fs.readFileSync(templatePath, "utf8");

      let valorFinal = String(row.valor ?? "").trim();

      if (["cupom", "queda", "bc"].includes(tipo)) {
        valorFinal = valorFinal.replace(/[^0-9,]/g, "");
      }

      let logoFile =
        row.logo && String(row.logo).trim() !== ""
          ? String(row.logo).trim()
          : "blank.png";

      const logoBase64 = this.imageToBase64(
        path.join(LOGOS_DIR, logoFile)
      );

      const seloBase64 = row.selo
        ? this.imageToBase64(
            path.join(
              SELOS_DIR,
              row.selo.toLowerCase() === "nova"
                ? "acaonova.png"
                : row.selo.toLowerCase() === "renovada"
                ? "acaorenovada.png"
                : ""
            )
          )
        : "";

      html = html
        .replaceAll("{{TEXTO}}", String(row.texto ?? ""))
        .replaceAll("{{VALOR}}", valorFinal)
        .replaceAll("{{COMPLEMENTO}}", String(row.complemento ?? ""))
        .replaceAll("{{LEGAL}}", String(row.legal ?? ""))
        .replaceAll("{{SEGMENTO}}", String(row.segmento ?? ""))
        .replaceAll("{{CUPOM}}", String(row.cupom ?? ""))
        .replaceAll("{{UF}}", row.uf ? `UF: ${row.uf}` : "")
        .replaceAll("{{URN}}", row.urn ? `URN: ${row.urn}` : "")
        .replaceAll("{{LOGO}}", logoBase64)
        .replaceAll("{{SELO}}", seloBase64);

      const tmpHtmlPath = path.join(TMP_DIR, `card_${processed + 1}.html`);
      fs.writeFileSync(tmpHtmlPath, html);

      const page = await this.browser!.newPage();
      await page.setViewport({ width: 700, height: 1058 });

      await page.goto(`file://${tmpHtmlPath}`, {
        waitUntil: "networkidle0",
      });

      const ordem = row.ordem ? String(row.ordem).trim() : processed + 1;
      const pdfName = `${ordem}_${tipo}.pdf`;
      const pdfPath = path.join(OUTPUT_DIR, pdfName);

      await page.pdf({
        path: pdfPath,
        width: "700px",
        height: "1058px",
        printBackground: true,
      });

      await page.close();

      processed++;

      this.emit("progress", {
        processed,
        total,
        percentage: Math.round((processed / total) * 100),
      });
    }

    const zipPath = path.join(OUTPUT_DIR, "cards.zip");
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

  // 👉 NOVA FUNÇÃO (JORNAL SIMPLES)
  async generateJornal(): Promise<string> {
    if (!this.browser) throw new Error("Browser not initialized");

    const files = fs
      .readdirSync(OUTPUT_DIR)
      .filter((f) => f.endsWith(".pdf") && !f.includes("jornal"));

    let html = `
    <html>
    <head>
      <style>
        @page { size: A4; margin: 20px; }

        .page { page-break-after: always; }

        .grid {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }

        .card {
          width: 32%;
          height: 350px;
        }

        iframe {
          width: 100%;
          height: 100%;
          border: none;
        }
      </style>
    </head>
    <body>
    `;

    let count = 0;

    html += `<div class="page"><div class="grid">`;

    for (const file of files) {
      const filePath = path.join(OUTPUT_DIR, file);

      html += `
        <div class="card">
          <iframe src="file://${filePath}"></iframe>
        </div>
      `;

      count++;

      if (count === 18) {
        html += `</div></div><div class="page"><div class="grid">`;
        count = 0;
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

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
