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

const TEMPLATES_DIR = path.join(BASE_DIR, "templates");
const LOGOS_DIR = path.join(BASE_DIR, "logos");
const SELOS_DIR = path.join(BASE_DIR, "selos");
const CARD_WIDTH = 700;
const CARD_HEIGHT = 1058;

export class CardGenerator extends EventEmitter {
  private browser: Browser | null = null;

  async initialize() {
    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
    if (!fs.existsSync(IMG_DIR)) fs.mkdirSync(IMG_DIR, { recursive: true });

    if (!this.browser) {
      this.browser = await puppeteer.launch({
        executablePath:
          process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium",
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
        headless: true,
      });
    }
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
    if (!fs.statSync(imagePath).isFile()) return "";

    const ext = path.extname(imagePath).replace(".", "");
    const buffer = fs.readFileSync(imagePath);
    return `data:image/${ext};base64,${buffer.toString("base64")}`;
  }

  resolveLogoPath(rawLogoValue: unknown): string {
    const fallbackLogo = path.join(LOGOS_DIR, "blank.png");
    const normalized = String(rawLogoValue ?? "").trim();
    if (!normalized) return fallbackLogo;

    const candidates = [
      normalized,
      `${normalized}.png`,
      `${normalized}.jpg`,
      `${normalized}.jpeg`,
      normalized.toLowerCase(),
      `${normalized.toLowerCase()}.png`,
      `${normalized.toLowerCase()}.jpg`,
      `${normalized.toLowerCase()}.jpeg`,
    ];

    const uniqueCandidates = candidates.filter((candidate, index) => candidates.indexOf(candidate) === index);
    for (const candidate of uniqueCandidates) {
      const fullPath = path.join(LOGOS_DIR, candidate);
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
        return fullPath;
      }
    }

    return fallbackLogo;
  }

  async processExcel(excelFilePath: string): Promise<string> {
    await this.initialize();
    return await this.generateCards(excelFilePath);
  }

  async generateCards(excelFilePath: string, _originalFileName?: string): Promise<string> {
    if (!this.browser) throw new Error("Browser not initialized");

    [OUTPUT_DIR, TMP_DIR, IMG_DIR].forEach((dir) => {
      fs.readdirSync(dir).forEach((file) => {
        const full = path.join(dir, file);
        if (fs.statSync(full).isFile()) fs.unlinkSync(full);
      });
    });

    const workbook = xlsx.readFile(excelFilePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: any[] = xlsx.utils.sheet_to_json(sheet, { defval: "" });

    const total = rows.length;
    let processed = 0;

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

      const logoBase64 = this.imageToBase64(this.resolveLogoPath(row.logo));

      const seloBase64 = row.selo
        ? this.imageToBase64(
            path.join(
              SELOS_DIR,
              row.selo === "nova"
                ? "acaonova.png"
                : row.selo === "renovada"
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

      const tmpHtml = path.join(TMP_DIR, `card_${processed}.html`);
      fs.writeFileSync(tmpHtml, html);

      const page = await this.browser.newPage();

      await page.setViewport({
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        deviceScaleFactor: 1,
      });

      await page.goto(`file://${tmpHtml}`, {
        waitUntil: "networkidle0",
      });

      const pdfPath = path.join(OUTPUT_DIR, `card_${processed}.pdf`);
      await page.pdf({
        path: pdfPath,
        width: `${CARD_WIDTH}px`,
        height: `${CARD_HEIGHT}px`,
        printBackground: true,
      });

      const imgPath = path.join(IMG_DIR, `card_${processed}.png`);
      await page.screenshot({
        path: imgPath,
        type: "png",
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

    await new Promise<void>((resolve, reject) => {
      const output = fs.createWriteStream(zipPath);
      const archive = archiver("zip");

      output.on("close", () => resolve());
      archive.on("error", reject);

      archive.pipe(output);

      fs.readdirSync(OUTPUT_DIR).forEach((file) => {
        const full = path.join(OUTPUT_DIR, file);
        if (fs.statSync(full).isFile() && file.endsWith(".pdf")) {
          archive.file(full, { name: file });
        }
      });

      archive.finalize();
    });

    return zipPath;
  }

  async generateZip(): Promise<string> {
    const zipPath = path.join(OUTPUT_DIR, "cards.zip");
    if (!fs.existsSync(zipPath)) {
      throw new Error("Arquivo ZIP ainda não foi gerado");
    }
    return zipPath;
  }

  async generateJornal(_filePathOrOptions?: string | {
    columns?: number;
    gap?: number;
    padding?: number;
    headerPath?: string;
    backgroundColor?: string;
    categoryBoxColor?: string;
    footerText?: string;
  }, _legacyOptions?: {
    columns?: number;
    gap?: number;
    padding?: number;
    headerPath?: string;
    backgroundColor?: string;
    categoryBoxColor?: string;
    footerText?: string;
  }): Promise<string> {
    if (!this.browser) throw new Error("Browser not initialized");

    const options =
      typeof _filePathOrOptions === "string"
        ? _legacyOptions
        : _filePathOrOptions;

    const files = fs
      .readdirSync(IMG_DIR)
      .filter((f) => f.endsWith(".png"))
      .sort((a, b) => {
        const aMatch = a.match(/\d+/);
        const bMatch = b.match(/\d+/);
        const aNum = aMatch ? Number(aMatch[0]) : 0;
        const bNum = bMatch ? Number(bMatch[0]) : 0;
        return aNum - bNum;
      });

    const columns = Math.max(1, options?.columns ?? 3);
    const gap = Math.max(0, options?.gap ?? 24);
    const padding = Math.max(0, options?.padding ?? 24);
    const cardWidth = CARD_WIDTH;
    const cardHeight = CARD_HEIGHT;

    let html = `
    <html>
    <head>
      <style>
        :root {
          --columns: ${columns};
          --card-width: ${cardWidth}px;
          --card-height: ${cardHeight}px;
          --gap: ${gap}px;
          --padding: ${padding}px;
        }

        @page {
          size: ${padding * 2 + columns * cardWidth + (columns - 1) * gap}px auto;
          margin: 0;
        }

        body {
          margin: 0;
          padding: var(--padding);
          background: transparent;
        }

        .grid {
          display: grid;
          grid-template-columns: repeat(var(--columns), var(--card-width));
          column-gap: var(--gap);
          row-gap: var(--gap);
        }

        .card {
          width: var(--card-width);
          height: var(--card-height);
          overflow: hidden;
          display: flex;
        }

        .card img {
          width: var(--card-width);
          height: var(--card-height);
          object-fit: cover;
        }
      </style>
    </head>
    <body>
      <div class="grid">
    `;

    for (const file of files) {
      const filePath = path.join(IMG_DIR, file);
      const buffer = fs.readFileSync(filePath);
      const base64 = `data:image/png;base64,${buffer.toString("base64")}`;

      html += `<div class="card"><img src="${base64}" /></div>`;
    }

    html += `
      </div>
    </body>
    </html>
    `;

    const jornalPath = path.join(OUTPUT_DIR, "jornal_ofertas.pdf");

    const rows = Math.ceil(files.length / columns);
    const pdfWidth = padding * 2 + columns * cardWidth + (columns - 1) * gap;
    const pdfHeight = padding * 2 + rows * cardHeight + Math.max(0, rows - 1) * gap;

    const page = await this.browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    await page.pdf({
      path: jornalPath,
      printBackground: true,
      omitBackground: true,
      width: `${pdfWidth}px`,
      height: `${pdfHeight}px`,
      preferCSSPageSize: true,
    });

    return jornalPath;
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
