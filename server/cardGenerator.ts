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
const JORNAL_OPTIONS_PATH = path.join(TMP_DIR, "jornal_last_options.json");

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

  getCategoriaValue(row: Record<string, unknown>): string {
    const direct = this.getRowValue(row, "categoria", "categorias");
    if (direct) return direct;

    const fuzzyKey = Object.keys(row).find((key) =>
      this.normalizeRowKey(key).includes("categoria")
    );
    if (!fuzzyKey) return "";

    return String(row[fuzzyKey] ?? "").trim();
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

  async processExcel(excelFilePath: string, originalFileName?: string): Promise<string> {
    await this.initialize();
    return await this.generateCards(excelFilePath, originalFileName);
  }

  async generateCards(excelFilePath: string, _originalFileName?: string): Promise<string> {
    if (!this.browser) throw new Error("Browser not initialized");

    if (_originalFileName) {
      const parsed = path.parse(_originalFileName);
      this.uploadedSpreadsheetBaseName = this.sanitizeSpreadsheetBaseName(parsed.name, "jornal_ofertas");
    }

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
    const manifestEntries: Array<{ imageFile: string; categoria: string }> = [];

    for (const row of rows) {
      const tipo = this.normalizeType(this.getRowValue(row, "tipo"));
      if (!tipo) continue;

      const templatePath = path.join(TEMPLATES_DIR, `${tipo}.html`);
      if (!fs.existsSync(templatePath)) continue;

      let html = fs.readFileSync(templatePath, "utf8");

      let valorFinal = this.getRowValue(row, "valor");
      if (["cupom", "queda", "bc"].includes(tipo)) {
        valorFinal = valorFinal.replace(/[^0-9,]/g, "");
      }

      const logoBase64 = this.imageToBase64(this.resolveLogoPath(this.getRowValue(row, "logo")));

      const seloValue = this.getRowValue(row, "selo").toLowerCase();
      const seloBase64 = seloValue
        ? this.imageToBase64(
            path.join(
              SELOS_DIR,
              seloValue === "nova"
                ? "acaonova.png"
                : seloValue === "renovada"
                ? "acaorenovada.png"
                : ""
            )
          )
        : "";

      html = html
        .replaceAll("{{TEXTO}}", this.getRowValue(row, "texto"))
        .replaceAll("{{VALOR}}", valorFinal)
        .replaceAll("{{COMPLEMENTO}}", this.getRowValue(row, "complemento"))
        .replaceAll("{{LEGAL}}", this.getRowValue(row, "legal"))
        .replaceAll("{{SEGMENTO}}", this.getRowValue(row, "segmento", "segmento de clientes"))
        .replaceAll("{{CUPOM}}", this.getRowValue(row, "cupom"))
        .replaceAll("{{UF}}", this.getRowValue(row, "uf") ? `UF: ${this.getRowValue(row, "uf")}` : "")
        .replaceAll("{{URN}}", this.getRowValue(row, "urn") ? `URN: ${this.getRowValue(row, "urn")}` : "")
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

      const ordem = this.sanitizeFilePart(this.getRowValue(row, "ordem") || String(processed + 1), String(processed + 1));
      const categoriaRaw = this.getCategoriaValue(row);
      const categoria = this.sanitizeFilePart(categoriaRaw, "sem_categoria");
      const tipoForName = this.sanitizeFilePart(tipo, "tipo");

      let pdfFileName = `${ordem}_${tipoForName}_${categoria}.pdf`;
      let pdfPath = path.join(OUTPUT_DIR, pdfFileName);
      let duplicateSuffix = 2;
      while (fs.existsSync(pdfPath)) {
        pdfFileName = `${ordem}_${tipoForName}_${categoria}_${duplicateSuffix}.pdf`;
        pdfPath = path.join(OUTPUT_DIR, pdfFileName);
        duplicateSuffix++;
      }

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

      manifestEntries.push({
        imageFile: path.basename(imgPath),
        categoria: categoriaRaw || "SEM CATEGORIA",
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
    fs.writeFileSync(JORNAL_MANIFEST_PATH, JSON.stringify(manifestEntries, null, 2), "utf8");

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

    let persistedOptions: Record<string, string> = {};
    if (fs.existsSync(JORNAL_OPTIONS_PATH)) {
      try {
        persistedOptions = JSON.parse(fs.readFileSync(JORNAL_OPTIONS_PATH, "utf8"));
      } catch {
        persistedOptions = {};
      }
    }

    const backgroundColor = "transparent";
    const categoryBoxColor =
      options?.categoryBoxColor ||
      persistedOptions.categoryBoxColor ||
      "#1D4ED8";
    const footerText =
      options?.footerText ??
      persistedOptions.footerText ??
      "";
    const headerPath =
      options?.headerPath ||
      persistedOptions.headerPath ||
      "";

    const optionsToPersist = {
      backgroundColor,
      categoryBoxColor,
      footerText,
      headerPath,
    };
    fs.writeFileSync(JORNAL_OPTIONS_PATH, JSON.stringify(optionsToPersist, null, 2), "utf8");

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

    try {
      let manifestEntries: Array<{ imageFile: string; categoria: string }> = [];
      if (fs.existsSync(JORNAL_MANIFEST_PATH)) {
        try {
          const parsedManifest = JSON.parse(fs.readFileSync(JORNAL_MANIFEST_PATH, "utf8"));
          manifestEntries = Array.isArray(parsedManifest)
            ? parsedManifest
            : files.map((file) => ({ imageFile: file, categoria: "SEM CATEGORIA" }));
        } catch {
          manifestEntries = files.map((file) => ({ imageFile: file, categoria: "SEM CATEGORIA" }));
        }
      } else {
        manifestEntries = files.map((file) => ({ imageFile: file, categoria: "SEM CATEGORIA" }));
      }

      const columns = Math.max(1, options?.columns ?? 3);
      const gap = Math.max(0, options?.gap ?? 24);
      const padding = Math.max(0, options?.padding ?? 24);
      const cardWidth = CARD_WIDTH;
      const cardHeight = CARD_HEIGHT;
      const interBoldFontPath = `file://${path.join(BASE_DIR, "fonts", "Inter-Bold.ttf").replace(/\\/g, "/")}`;
      const interRegularFontPath = `file://${path.join(BASE_DIR, "fonts", "Inter-Regular.ttf").replace(/\\/g, "/")}`;
      const headerExt = path.extname(headerPath).toLowerCase();
      const isHeaderPdf = headerExt === ".pdf";
      let headerImageBase64 =
        headerPath && !isHeaderPdf ? this.imageToBase64(headerPath) : "";

      if (headerPath && isHeaderPdf && fs.existsSync(headerPath)) {
        const headerPreviewPage = await this.browser.newPage();
        try {
          await headerPreviewPage.setViewport({
            width: padding * 2 + columns * cardWidth + (columns - 1) * gap,
            height: 220,
            deviceScaleFactor: 1,
          });
          await headerPreviewPage.goto(`file://${headerPath.replace(/\\/g, "/")}`, {
            waitUntil: "networkidle0",
          });
          const headerBuffer = await headerPreviewPage.screenshot({ type: "png" });
          headerImageBase64 = `data:image/png;base64,${Buffer.from(headerBuffer).toString("base64")}`;
        } catch {
          headerImageBase64 = "";
        } finally {
          await headerPreviewPage.close();
        }
      }

    let html = `
    <html>
    <head>
      <style>
        @font-face {
          font-family: 'Inter';
          src: url('${interBoldFontPath}') format('truetype');
          font-weight: 700;
        }
        @font-face {
          font-family: 'Inter';
          src: url('${interRegularFontPath}') format('truetype');
          font-weight: 400;
        }

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
          background: ${backgroundColor};
        }

        .grid {
          display: flex;
          flex-direction: column;
          row-gap: var(--gap);
        }

        .row {
          display: grid;
          column-gap: var(--gap);
          justify-content: center;
        }

        .categoria-tarja {
          width: 100%;
          height: 72px;
          border-radius: 999px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #ffffff;
          font-family: 'Inter', sans-serif;
          font-size: 34px;
          font-weight: 900;
          letter-spacing: 1px;
        }

        .jornal-header {
          width: 100%;
          border-radius: 24px;
          overflow: hidden;
        }
        .jornal-header img,
        .jornal-header embed {
          width: 100%;
          height: 220px;
          object-fit: cover;
          border: none;
          display: block;
          background: #ffffff;
        }

        .jornal-footer {
          width: 100%;
          padding: 0 24px;
          font-family: 'Inter', sans-serif;
          font-size: 24px;
          line-height: 1.35;
          color: #1F2937;
          text-align: center;
          white-space: pre-wrap;
          word-break: break-word;
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

    if (headerPath && headerImageBase64) {
      html += `<div class="jornal-header"><img src="${headerImageBase64}" alt="Header"></div>`;
    }

    const blocks: Array<
      | { type: "banner"; categoria: string; color: string }
      | { type: "row"; cards: Array<{ imageFile: string; categoria: string }> }
    > = [];

    let currentRow: Array<{ imageFile: string; categoria: string }> = [];
    let previousCategoriaKey = "";
    let previousBannerColor: string | undefined;

    for (const entry of manifestEntries) {
      const categoriaLabel = (entry.categoria || "SEM CATEGORIA").trim();
      const categoriaKey = this.normalizeRowKey(categoriaLabel);

      if (categoriaKey && categoriaKey !== previousCategoriaKey) {
        if (currentRow.length > 0) {
          blocks.push({ type: "row", cards: currentRow });
          currentRow = [];
        }

        const color = this.pickBannerColor(previousBannerColor);
        previousBannerColor = color;
        blocks.push({ type: "banner", categoria: categoriaLabel, color });
        previousCategoriaKey = categoriaKey;
      }

      currentRow.push(entry);
      if (currentRow.length === columns) {
        blocks.push({ type: "row", cards: currentRow });
        currentRow = [];
      }
    }
    if (currentRow.length > 0) blocks.push({ type: "row", cards: currentRow });

    for (const block of blocks) {
      if (block.type === "banner") {
        html += `<div class="categoria-tarja" style="background:${categoryBoxColor};">${block.categoria}</div>`;
        continue;
      }

      html += `<div class="row" style="grid-template-columns: repeat(${block.cards.length}, var(--card-width));">`;
      for (const card of block.cards) {
        const filePath = path.join(IMG_DIR, card.imageFile);
        if (!fs.existsSync(filePath)) continue;
        const buffer = fs.readFileSync(filePath);
        const base64 = `data:image/png;base64,${buffer.toString("base64")}`;
        html += `<div class="card"><img src="${base64}" /></div>`;
      }
      html += `</div>`;
    }

    html += `
      </div>
      ${footerText ? `<div class="jornal-footer">${footerText}</div>` : ""}
    </body>
    </html>
    `;

      const jornalFileName = `${this.uploadedSpreadsheetBaseName}.pdf`;
      const jornalPath = path.join(OUTPUT_DIR, jornalFileName);

      const bannerCount = blocks.filter((block) => block.type === "banner").length;
      const rowCount = blocks.filter((block) => block.type === "row").length;
      const bannerHeight = 72;
      const headerHeight = headerPath ? 220 : 0;
      const footerHeight = footerText ? 90 : 0;
      const contentHeight =
        rowCount * cardHeight +
        bannerCount * bannerHeight +
        Math.max(0, blocks.length - 1) * gap;

      const pdfWidth = padding * 2 + columns * cardWidth + (columns - 1) * gap;
      const pdfHeight =
        padding * 2 +
        contentHeight +
        (headerHeight ? headerHeight + gap : 0) +
        (footerHeight ? footerHeight + gap : 0);

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
    } catch (error) {
      const columns = 3;
      const gap = 24;
      const padding = 24;
      const cardWidth = CARD_WIDTH;
      const cardHeight = CARD_HEIGHT;
      const rows = Math.ceil(files.length / columns);
      const pdfWidth = padding * 2 + columns * cardWidth + (columns - 1) * gap;
      const pdfHeight = padding * 2 + rows * cardHeight + Math.max(0, rows - 1) * gap;
      const jornalFileName = `${this.uploadedSpreadsheetBaseName}.pdf`;
      const jornalPath = path.join(OUTPUT_DIR, jornalFileName);

      let fallbackHtml = `<html><body style="margin:0;padding:${padding}px;background:transparent;"><div style="display:grid;grid-template-columns:repeat(${columns},${cardWidth}px);gap:${gap}px;">`;
      for (const file of files) {
        const filePath = path.join(IMG_DIR, file);
        if (!fs.existsSync(filePath)) continue;
        const base64 = fs.readFileSync(filePath).toString("base64");
        fallbackHtml += `<img src="data:image/png;base64,${base64}" style="width:${cardWidth}px;height:${cardHeight}px;object-fit:cover;" />`;
      }
      fallbackHtml += "</div></body></html>";

      const fallbackPage = await this.browser.newPage();
      await fallbackPage.setContent(fallbackHtml, { waitUntil: "networkidle0" });
      await fallbackPage.pdf({
        path: jornalPath,
        printBackground: true,
        omitBackground: true,
        width: `${pdfWidth}px`,
        height: `${pdfHeight}px`,
        preferCSSPageSize: true,
      });
      return jornalPath;
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
