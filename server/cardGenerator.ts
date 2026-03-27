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

    if (!this.browser) {
      console.log("Iniciando navegador Puppeteer...");
      this.browser = await puppeteer.launch({
        executablePath:
          process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium",
        args: [
          "--no-sandbox", 
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--disable-gpu",
          "--no-first-run",
          "--no-zygote"
        ],
        headless: true,
      });
      console.log("Navegador Puppeteer iniciado com sucesso.");
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

  private sanitizeFileName(value: string): string {
    return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").toLowerCase().trim();
  }

  private getUniqueFilePath(filePath: string): string {
    if (!fs.existsSync(filePath)) return filePath;
    const ext = path.extname(filePath);
    const name = path.basename(filePath, ext);
    const dir = path.dirname(filePath);
    let counter = 2;
    let newPath = "";
    do {
      newPath = path.join(dir, `${name}_v${counter}${ext}`);
      counter++;
    } while (fs.existsSync(newPath));
    return newPath;
  }

  private getDateStamp(): string {
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const dd = String(now.getDate()).padStart(2, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const aa = String(now.getFullYear()).slice(-2);
    const hh = String(now.getHours()).padStart(2, "0");
    const min = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");
    return `${dd}_${mm}_${aa}-${hh}_${min}_${ss}`;
  }

  imageToBase64(imagePath: string): string {
    if (!imagePath || !fs.existsSync(imagePath)) return "";
    const ext = path.extname(imagePath).replace(".", "").toLowerCase();
    const buffer = fs.readFileSync(imagePath);
    
    let mimeType = `image/${ext}`;
    if (ext === "svg") mimeType = "image/svg+xml";
    if (ext === "jpg") mimeType = "image/jpeg";

    return `data:${mimeType};base64,${buffer.toString("base64")}`;
  }

  /**
   * Busca inteligente de logo (Melhorada):
   * 1. Tenta o nome exato fornecido.
   * 2. Tenta o nome sem espaços e em minúsculo com várias extensões.
   * 3. Tenta buscar por prefixo (se o arquivo começa com o que foi digitado).
   * 4. Retorna 'blank.png' se nada for encontrado.
   */
  private findLogoFile(logoName: string): string {
    if (!logoName || String(logoName).trim() === "") return "blank.png";

    const cleanName = String(logoName).trim();
    const extensions = [".png", ".jpg", ".jpeg", ".webp", ".svg"];

    if (fs.existsSync(path.join(LOGOS_DIR, cleanName))) {
      return cleanName;
    }

    const searchName = cleanName.toLowerCase();
    const filesInLogos = fs.readdirSync(LOGOS_DIR);

    for (const ext of extensions) {
      const target = searchName.endsWith(ext) ? searchName : searchName + ext;
      const found = filesInLogos.find(f => f.toLowerCase() === target);
      if (found) return found;
    }

    const validFiles = filesInLogos.filter(f => {
      const ext = path.extname(f).toLowerCase();
      return extensions.includes(ext);
    });

    const prefixMatch = validFiles.find(f => {
      const baseName = path.parse(f).name.toLowerCase();
      return baseName.startsWith(searchName);
    });

    if (prefixMatch) return prefixMatch;

    return "blank.png";
  }

  async processExcel(excelFilePath: string): Promise<any[]> {
    await this.initialize();
    
    const workbook = xlsx.readFile(excelFilePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: any[] = xlsx.utils.sheet_to_json(sheet, { defval: "" });
    
    const cards: any[] = [];
    const total = rows.length;
    let processed = 0;

    if (fs.existsSync(OUTPUT_DIR)) {
      fs.readdirSync(OUTPUT_DIR).forEach((file) => {
        if (file.endsWith(".pdf") || file.endsWith(".zip")) {
          try { fs.unlinkSync(path.join(OUTPUT_DIR, file)); } catch(e) {}
        }
      });
    }

    const BATCH_SIZE = 3;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(async (row, index) => {
        const currentIdx = i + index;
        const tipo = this.normalizeType(row.tipo);
        if (!tipo) return;

        const templatePath = path.join(TEMPLATES_DIR, `${tipo}.html`);
        if (!fs.existsSync(templatePath)) return;

        let html = fs.readFileSync(templatePath, "utf8");
        let valorFinal = String(row.valor ?? "");
        if (tipo !== "promocao") {
          valorFinal = valorFinal.replace(/%/g, "").trim();
        }

        const logoFile = this.findLogoFile(row.logo);
        const logoBase64 = this.imageToBase64(path.join(LOGOS_DIR, logoFile));
        const seloBase64 = row.selo ? this.imageToBase64(path.join(SELOS_DIR, row.selo.toLowerCase() === "nova" ? "acaonova.png" : row.selo.toLowerCase() === "renovada" ? "acaorenovada.png" : "")) : "";
        const segmentoRaw = row.segmento && String(row.segmento).trim() !== "" ? String(row.segmento).trim() : "";

        html = html
          .replaceAll("{{TEXTO}}", String(row.texto ?? ""))
          .replaceAll("{{VALOR}}", valorFinal)
          .replaceAll("{{COMPLEMENTO}}", String(row.complemento ?? ""))
          .replaceAll("{{LEGAL}}", String(row.legal ?? ""))
          .replaceAll("{{SEGMENTO}}", segmentoRaw)
          .replaceAll("{{CUPOM}}", String(row.cupom ?? ""))
          .replaceAll("{{UF}}", row.uf ? `UF: ${row.uf}` : "")
          .replaceAll("{{URN}}", row.urn ? `URN: ${row.urn}` : "")
          .replaceAll("{{LOGO}}", logoBase64)
          .replaceAll("{{SELO}}", seloBase64);

        const tmpHtmlPath = path.join(TMP_DIR, `card_${currentIdx + 1}.html`);
        fs.writeFileSync(tmpHtmlPath, html);

        const page = await this.browser!.newPage();
        try {
          await page.setViewport({ width: 700, height: 1058 });
          await page.goto(`file://${tmpHtmlPath}`, { waitUntil: "networkidle0", timeout: 45000 });

          const ordemFinal = row.ordem && String(row.ordem).trim() !== "" ? String(row.ordem).trim() : String(currentIdx + 1);
          const categoriaRaw = row.categoria && String(row.categoria).trim() !== "" ? String(row.categoria).trim() : "sem-categoria";
          const categoria = this.sanitizeFileName(categoriaRaw);
          const pdfName = `${ordemFinal}_${tipo}_${categoria}.pdf`;
          const pdfPath = path.join(OUTPUT_DIR, pdfName);

          await page.pdf({
            path: pdfPath,
            width: "700px",
            height: "1058px",
            printBackground: true,
            margin: { top: "0px", right: "0px", bottom: "0px", left: "0px" },
          });

          cards.push({ id: pdfName, template: tipo, data: row });
        } catch (err) {
          console.error(`Erro ao gerar card na linha ${currentIdx + 1}:`, err);
        } finally {
          await page.close();
        }

        processed++;
        this.emit("progress", { processed, total, percentage: Math.round((processed / total) * 100) });
      }));
    }

    return cards;
  }

  async generateZip(): Promise<string> {
    const date = this.getDateStamp();
    const zipPath = path.join(OUTPUT_DIR, `cards_${date}.zip`);
    const output = fs.createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    return new Promise((resolve, reject) => {
      output.on("close", () => resolve(zipPath));
      archive.on("error", (err) => reject(err));
      archive.pipe(output);

      const files = fs.readdirSync(OUTPUT_DIR);
      let added = 0;
      files.forEach((file) => {
        if (file.endsWith(".pdf") && !file.includes("jornal_ofertas")) {
          archive.file(path.join(OUTPUT_DIR, file), { name: file });
          added++;
        }
      });

      if (added === 0) {
        reject(new Error("Nenhum arquivo PDF encontrado para compactar."));
        return;
      }

      archive.finalize();
    });
  }

  private getContrastColor(hexColor: string): string {
    if (!hexColor || !hexColor.startsWith('#')) return '#ffffff';
    const r = parseInt(hexColor.slice(1, 3), 16);
    const g = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);
    const yiq = (r * 299 + g * 587 + b * 114) / 1000;
    return yiq >= 128 ? '#000000' : '#ffffff';
  }

  async generateJornal(options: { headerPath?: string, backgroundColor?: string, categoryBoxColor?: string, footerText?: string } = {}): Promise<string> {
    await this.initialize();
    
    const excelFilePath = path.join(process.cwd(), "uploads_excel", "current_planilha.xlsx");
    if (!fs.existsSync(excelFilePath)) throw new Error("Nenhuma planilha encontrada. Por favor, envie a planilha primeiro.");

    const { backgroundColor = "#1a365d", categoryBoxColor = "#2563eb", footerText } = options;
    const contrastColor = this.getContrastColor(backgroundColor);

    const workbook = xlsx.readFile(excelFilePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: any[] = xlsx.utils.sheet_to_json(sheet, { defval: "" });

    const groupedRows: { [key: string]: any[] } = {};
    rows.forEach(row => {
      const cat = String(row.categoria || "OUTROS").toUpperCase();
      if (!groupedRows[cat]) groupedRows[cat] = [];
      groupedRows[cat].push(row);
    });

    const vigencia = rows[0]?.VIGÊNCIA || "00/00 a 00/00";
    const gap = 80;
    const cardWidth = 700;
    const pageWidth = (cardWidth * 3) + (gap * 4);

    let headerHtml = "";
    if (options.headerPath && fs.existsSync(options.headerPath)) {
      const headerBase64 = this.imageToBase64(options.headerPath);
      headerHtml = `<div class="header-image-container"><img src="${headerBase64}" class="header-image" /></div>`;
    } else {
      headerHtml = `<div class="header"><h1 class="header-title">OFERTAS DA SEMANA</h1><div class="header-date">${vigencia}</div></div>`;
    }

    const footerContent = footerText || "OFERTAS SUJEITAS A SAÍREM DO AR A QUALQUER MOMENTO SEM AVISO PRÉVIO. CONFIRA A REGRA E MIX PARTICIPANTE DE CADA AÇÃO.";

    let html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap" rel="stylesheet"><style>@page { margin: 0; size: ${pageWidth}px auto; } * { box-sizing: border-box; } html, body { margin: 0; padding: 0; background: ${backgroundColor}; font-family: 'Inter', sans-serif; width: ${pageWidth}px; } .header { background: #f0f0f0; padding: 60px; text-align: center; border-bottom: 10px solid ${categoryBoxColor}; } .header-title { font-size: 120px; font-weight: 900; margin: 0; color: #333; letter-spacing: -2px; } .header-date { font-size: 60px; font-weight: 700; color: #666; margin-top: 10px; } .header-image-container { width: 100%; line-height: 0; } .header-image { width: 100%; height: auto; display: block; } .container { padding: ${gap}px; } .category-section { margin-bottom: ${gap * 1.5}px; } .category-title { background: ${categoryBoxColor}; color: white; padding: 30px 60px; font-size: 54px; font-weight: 900; border-radius: 20px; margin-bottom: ${gap}px; display: inline-block; text-transform: uppercase; box-shadow: 0 15px 35px rgba(0,0,0,0.2); } .cards-grid { display: grid; grid-template-columns: repeat(3, ${cardWidth}px); gap: ${gap}px; } .card-wrapper { width: ${cardWidth}px; height: 1058px; background: white; border-radius: 30px; overflow: hidden; box-shadow: 0 25px 50px rgba(0,0,0,0.3); position: relative; } .card-content-inner { width: 100%; height: 100%; } .footer { padding: 80px ${gap}px; text-align: center; color: ${contrastColor}; font-size: 32px; font-weight: 700; line-height: 1.4; opacity: 0.9; }</style></head><body>${headerHtml}<div class="container">`;

    for (const [category, categoryRows] of Object.entries(groupedRows)) {
      html += `<div class="category-section"><div class="category-title">${category}</div><div class="cards-grid">`;
      for (const row of categoryRows) {
        const tipo = this.normalizeType(row.tipo);
        if (!tipo) continue;
        const templatePath = path.join(TEMPLATES_DIR, `${tipo}.html`);
        if (!fs.existsSync(templatePath)) continue;
        let cardHtml = fs.readFileSync(templatePath, "utf8");
        let valorFinal = String(row.valor ?? "");
        if (tipo !== "promocao") valorFinal = valorFinal.replace(/%/g, "").trim();
        
        const logoFile = this.findLogoFile(row.logo);
        const logoBase64 = this.imageToBase64(path.join(LOGOS_DIR, logoFile));
        const seloBase64 = row.selo ? this.imageToBase64(path.join(SELOS_DIR, row.selo.toLowerCase() === "nova" ? "acaonova.png" : row.selo.toLowerCase() === "renovada" ? "acaorenovada.png" : "")) : "";
        const segmentoRaw = row.segmento && String(row.segmento).trim() !== "" ? String(row.segmento).trim() : "";
        
        cardHtml = cardHtml.replaceAll("{{TEXTO}}", String(row.texto ?? "")).replaceAll("{{VALOR}}", valorFinal).replaceAll("{{COMPLEMENTO}}", String(row.complemento ?? "")).replaceAll("{{LEGAL}}", String(row.legal ?? ""))
          .replaceAll("{{SEGMENTO}}", segmentoRaw)
          .replaceAll("{{CUPOM}}", String(row.cupom ?? ""))
          .replaceAll("{{UF}}", row.uf ? `UF: ${row.uf}` : "")
          .replaceAll("{{URN}}", row.urn ? `URN: ${row.urn}` : "")
          .replaceAll("{{LOGO}}", logoBase64)
          .replaceAll("{{SELO}}", seloBase64);
        
        html += `<div class="card-wrapper"><div class="card-content-inner">${cardHtml}</div></div>`;
      }
      html += `</div></div>`;
    }

    html += `</div><div class="footer">${footerContent}</div></body></html>`;

    const jornalHtmlPath = path.join(TMP_DIR, `jornal_completo.html`);
    fs.writeFileSync(jornalHtmlPath, html);

    const page = await this.browser!.newPage();
    try {
      await page.setViewport({ width: pageWidth, height: 2000 });
      await page.goto(`file://${jornalHtmlPath}`, { waitUntil: "networkidle0", timeout: 120000 });
      const jornalPdfPath = path.join(OUTPUT_DIR, `jornal_ofertas.pdf`);
      await page.pdf({ path: jornalPdfPath, width: `${pageWidth}px`, height: "auto", printBackground: true, margin: { top: "0px", right: "0px", bottom: "0px", left: "0px" } });
      return jornalPdfPath;
    } finally {
      await page.close();
    }
  }
}
