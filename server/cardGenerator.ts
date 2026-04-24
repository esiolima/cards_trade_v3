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
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
        headless: true,
      });
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
    const mimeType = ext === "svg" ? "image/svg+xml" : `image/${ext}`;
    return `data:${mimeType};base64,${buffer.toString("base64")}`;
  }

  private findLogoFile(logoName: string): string {
    if (!logoName) return "blank.png";
    const cleanName = String(logoName).trim();
    if (fs.existsSync(path.join(LOGOS_DIR, cleanName))) return cleanName;
    const filesInLogos = fs.readdirSync(LOGOS_DIR);
    const found = filesInLogos.find(f => f.toLowerCase().startsWith(cleanName.toLowerCase()));
    return found || "blank.png";
  }

  async generateCards(excelFilePath: string): Promise<string> {
    await this.initialize();
    
    // Limpa outputs antigos
    fs.readdirSync(OUTPUT_DIR).forEach(f => {
      if (f.endsWith(".pdf") || f.endsWith(".zip")) fs.unlinkSync(path.join(OUTPUT_DIR, f));
    });

    const workbook = xlsx.readFile(excelFilePath);
    const rows: any[] = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: "" });
    
    let processed = 0;
    for (const row of rows) {
      const tipo = this.normalizeType(row.tipo);
      if (!tipo) continue;

      const templatePath = path.join(TEMPLATES_DIR, `${tipo}.html`);
      if (!fs.existsSync(templatePath)) continue;

      let html = fs.readFileSync(templatePath, "utf8");
      const logoBase = this.imageToBase64(path.join(LOGOS_DIR, this.findLogoFile(row.logo)));
      const seloBase = row.selo ? this.imageToBase64(path.join(SELOS_DIR, row.selo.toLowerCase() === "nova" ? "acaonova.png" : "acaorenovada.png")) : "";

      html = html.replaceAll("{{TEXTO}}", String(row.texto ?? ""))
                 .replaceAll("{{VALOR}}", String(row.valor ?? ""))
                 .replaceAll("{{COMPLEMENTO}}", String(row.complemento ?? ""))
                 .replaceAll("{{LEGAL}}", String(row.legal ?? ""))
                 .replaceAll("{{SEGMENTO}}", String(row.segmento ?? ""))
                 .replaceAll("{{UF}}", row.uf ? `UF: ${row.uf}` : "")
                 .replaceAll("{{URN}}", row.urn ? `URN: ${row.urn}` : "")
                 .replaceAll("{{LOGO}}", logoBase)
                 .replaceAll("{{SELO}}", seloBase);

      const page = await this.browser!.newPage();
      try {
        await page.setViewport({ width: 700, height: 1058 });
        await page.setContent(html, { waitUntil: "networkidle0" });
        const pdfName = `${processed + 1}_${tipo}.pdf`;
        await page.pdf({ path: path.join(OUTPUT_DIR, pdfName), width: "700px", height: "1058px", printBackground: true });
      } finally {
        await page.close();
      }
      processed++;
      this.emit("progress", { processed, total: rows.length, percentage: Math.round((processed / rows.length) * 100) });
    }

    const zipPath = path.join(OUTPUT_DIR, "cards.zip");
    const output = fs.createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });
    return new Promise((resolve, reject) => {
      output.on("close", () => resolve(zipPath));
      archive.pipe(output);
      fs.readdirSync(OUTPUT_DIR).forEach(f => { if (f.endsWith(".pdf")) archive.file(path.join(OUTPUT_DIR, f), { name: f }); });
      archive.finalize();
    });
  }

  async generateJornal(): Promise<string> {
    await this.initialize();
    const excelFilePath = path.join(process.cwd(), "uploads_excel", "current_planilha.xlsx");
    if (!fs.existsSync(excelFilePath)) throw new Error("Planilha não encontrada");

    const workbook = xlsx.readFile(excelFilePath);
    const rows: any[] = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: "" });

    const grouped: { [key: string]: any[] } = {};
    rows.forEach(row => {
      const cat = String(row.categoria || "OUTROS").toUpperCase();
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(row);
    });

    const cardW = 700;
    const gap = 30;
    const totalW = (cardW * 3) + (gap * 2);

    let html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
      * { margin: 0; padding: 0; box-sizing: border-box; -webkit-print-color-adjust: exact; }
      body { background: #064e3b; width: ${totalW + 100}px; padding: 60px 0; font-family: Arial, sans-serif; display: flex; flex-direction: column; align-items: center; }
      .container { width: ${totalW}px; }
      .cat-label { background: #1d4ed8; color: white; width: 100%; height: 120px; line-height: 120px; font-size: 60px; font-weight: bold; text-align: center; border-radius: 20px; margin: 50px 0 30px 0; text-transform: uppercase; }
      .grid-table { border-collapse: separate; border-spacing: ${gap}px; margin-left: -${gap}px; }
      .card-item { width: ${cardW}px; height: 1058px; background: white; border-radius: 15px; overflow: hidden; vertical-align: top; }
      .inner-card-wrapper { width: 700px; height: 1058px; position: relative; overflow: hidden; }
    </style></head><body><div class="container">`;

    for (const [category, items] of Object.entries(grouped)) {
      html += `<div class="cat-label">${category}</div><table class="grid-table"><tr>`;
      let count = 0;
      for (const item of items) {
        if (count > 0 && count % 3 === 0) html += `</tr><tr>`;
        const tipo = this.normalizeType(item.tipo);
        const tPath = path.join(TEMPLATES_DIR, `${tipo}.html`);
        if (!fs.existsSync(tPath)) continue;

        let cHtml = fs.readFileSync(tPath, "utf8");
        const lBase = this.imageToBase64(path.join(LOGOS_DIR, this.findLogoFile(item.logo)));
        const sBase = item.selo ? this.imageToBase64(path.join(SELOS_DIR, item.selo.toLowerCase() === "nova" ? "acaonova.png" : "acaorenovada.png")) : "";

        cHtml = cHtml.replaceAll("{{TEXTO}}", String(item.texto ?? ""))
                     .replaceAll("{{VALOR}}", String(item.valor ?? ""))
                     .replaceAll("{{COMPLEMENTO}}", String(item.complemento ?? ""))
                     .replaceAll("{{LEGAL}}", String(item.legal ?? ""))
                     .replaceAll("{{SEGMENTO}}", String(item.segmento ?? ""))
                     .replaceAll("{{LOGO}}", lBase)
                     .replaceAll("{{SELO}}", sBase)
                     .replace(/<html[^>]*>|<\/html>|<body[^>]*>|<\/body>|<!DOCTYPE[^>]*>/gi, "");

        html += `<td class="card-item"><div class="inner-card-wrapper">${cHtml}</div></td>`;
        count++;
      }
      html += `</tr></table>`;
    }
    html += `</div></body></html>`;

    const pdfPath = path.join(OUTPUT_DIR, "jornal_ofertas.pdf");
    const page = await this.browser!.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const dims = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight }));
    await page.pdf({ path: pdfPath, width: dims.w + "px", height: dims.h + "px", printBackground: true });
    await page.close();
    return pdfPath;
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}