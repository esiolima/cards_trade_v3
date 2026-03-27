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
    if (ext === "png") mimeType = "image/png";
    
    return `data:${mimeType};base64,${buffer.toString("base64")}`;
  }

  private findLogoFile(logoName: string): string {
    if (!logoName) return "blank.png";
    const files = fs.readdirSync(LOGOS_DIR);
    const search = String(logoName).toLowerCase().trim();
    const found = files.find(f => f.toLowerCase().includes(search));
    return found || "blank.png";
  }

  async processExcel(filePath: string): Promise<any[]> {
    const workbook = xlsx.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: any[] = xlsx.utils.sheet_to_json(sheet, { defval: "" });
    
    const cards: any[] = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const tipo = this.normalizeType(row.tipo);
      if (!tipo) continue;

      cards.push({
        id: `${i + 1}_${tipo}_${this.sanitizeFileName(row.categoria || "outros")}.pdf`,
        template: tipo,
        data: row
      });
    }
    return cards;
  }

  async generateZip(): Promise<string> {
    const zipPath = path.join(OUTPUT_DIR, `cards_${this.getDateStamp()}.zip`);
    const output = fs.createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.pipe(output);

    const files = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith(".pdf") && !f.startsWith("jornal_"));
    for (const file of files) {
      archive.file(path.join(OUTPUT_DIR, file), { name: file });
    }

    await archive.finalize();
    return zipPath;
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
    const gap = 40;
    const cardWidth = 700;
    const gridWidth = (cardWidth * 3) + (gap * 2); 
    const pageWidth = gridWidth + (gap * 4); // Margem extra para segurança
    
    const rowCount = Math.ceil(rows.length / 3);
    const estimatedHeight = 3000 + (rowCount * 1300); // Altura generosa para evitar cortes

    let headerHtml = "";
    if (options.headerPath && fs.existsSync(options.headerPath)) {
      const headerBase64 = this.imageToBase64(options.headerPath);
      headerHtml = `<table width="100%" border="0" cellspacing="0" cellpadding="0"><tr><td align="center"><img src="${headerBase64}" style="width: 100%; display: block;" /></td></tr></table>`;
    } else {
      headerHtml = `<table width="100%" border="0" cellspacing="0" cellpadding="0" style="background: #f0f0f0; border-bottom: 20px solid ${categoryBoxColor};"><tr><td align="center" style="padding: 100px 0;"><h1 style="font-size: 150px; font-weight: 900; margin: 0; color: #333; font-family: 'Inter', sans-serif;">OFERTAS DA SEMANA</h1><div style="font-size: 80px; font-weight: 700; color: #666; margin-top: 20px; font-family: 'Inter', sans-serif;">${vigencia}</div></td></tr></table>`;
    }

    const footerContent = footerText || "OFERTAS SUJEITAS A SAÍREM DO AR A QUALQUER MOMENTO SEM AVISO PRÉVIO. CONFIRA A REGRA E MIX PARTICIPANTE DE CADA AÇÃO.";

    let html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap" rel="stylesheet"><style>
      @page { margin: 0; size: ${pageWidth}px ${estimatedHeight}px; } 
      * { box-sizing: border-box; -webkit-print-color-adjust: exact; } 
      html, body { margin: 0; padding: 0; background: ${backgroundColor}; font-family: 'Inter', sans-serif; width: ${pageWidth}px; } 
      body { display: block; width: ${pageWidth}px; margin: 0 auto; background: ${backgroundColor}; }
      .card-container { width: ${cardWidth}px; height: 100%; }
    </style></head><body>${headerHtml}<table width="100%" border="0" cellspacing="0" cellpadding="${gap}" style="background: ${backgroundColor};"><tr><td align="center">`;

    for (const [category, categoryRows] of Object.entries(groupedRows)) {
      // Título da Categoria
      html += `<table width="${gridWidth}" border="0" cellspacing="0" cellpadding="0" style="margin-top: 100px; margin-bottom: 60px;"><tr><td align="center"><div style="background: ${categoryBoxColor}; color: white; padding: 40px 100px; font-size: 70px; font-weight: 900; border-radius: 30px; display: inline-block; text-transform: uppercase; font-family: 'Inter', sans-serif; box-shadow: 0 20px 50px rgba(0,0,0,0.4);">${category}</div></td></tr></table>`;
      
      // Grid de Cards usando Tabelas
      html += `<table width="${gridWidth}" border="0" cellspacing="${gap}" cellpadding="0">`;
      
      for (let i = 0; i < categoryRows.length; i += 3) {
        const chunk = categoryRows.slice(i, i + 3);
        html += `<tr>`;
        
        // Se for a última linha e tiver menos de 3 cards, centralizamos usando uma tabela interna ou células vazias
        if (chunk.length < 3) {
          html += `<td align="center" colspan="3"><table border="0" cellspacing="${gap}" cellpadding="0"><tr>`;
          for (const row of chunk) {
            const cardHtml = this.renderCard(row);
            html += `<td valign="top"><div class="card-container">${cardHtml}</div></td>`;
          }
          html += `</tr></table></td>`;
        } else {
          for (const row of chunk) {
            const cardHtml = this.renderCard(row);
            html += `<td valign="top" align="center"><div class="card-container">${cardHtml}</div></td>`;
          }
        }
        html += `</tr>`;
      }
      html += `</table>`;
    }

    html += `</td></tr></table><table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-top: 150px; margin-bottom: 200px;"><tr><td align="center" style="padding: 0 100px; color: ${contrastColor}; font-size: 45px; font-weight: 900; line-height: 1.6; font-family: 'Inter', sans-serif;">${footerContent}</td></tr></table></body></html>`;

    const jornalHtmlPath = path.join(TMP_DIR, `jornal_completo.html`);
    fs.writeFileSync(jornalHtmlPath, html);

    const page = await this.browser!.newPage();
    try {
      await page.setViewport({ width: pageWidth, height: estimatedHeight }); 
      await page.goto(`file://${jornalHtmlPath}`, { waitUntil: "networkidle0", timeout: 120000 });
      await page.evaluateHandle("document.fonts.ready");
      
      const bodyHeight = await page.evaluate(() => document.documentElement.scrollHeight);
      const jornalPdfPath = path.join(OUTPUT_DIR, `jornal_ofertas.pdf`);

      await page.pdf({ 
        path: jornalPdfPath, 
        width: `${pageWidth}px`,
        height: `${Math.ceil(bodyHeight) + 200}px`,
        printBackground: true, 
        margin: { top: "0px", right: "0px", bottom: "0px", left: "0px" }
      });
      return jornalPdfPath;
    } finally {
      await page.close();
    }
  }

  private renderCard(row: any): string {
    const tipo = this.normalizeType(row.tipo);
    if (!tipo) return "";
    const templatePath = path.join(TEMPLATES_DIR, `${tipo}.html`);
    if (!fs.existsSync(templatePath)) return "";
    
    let cardHtml = fs.readFileSync(templatePath, "utf8");
    let valorFinal = String(row.valor ?? "");
    if (tipo !== "promocao") valorFinal = valorFinal.replace(/%/g, "").trim();
    
    const logoFile = this.findLogoFile(row.logo);
    const logoBase64 = this.imageToBase64(path.join(LOGOS_DIR, logoFile));
    const seloBase64 = row.selo ? this.imageToBase64(path.join(SELOS_DIR, row.selo.toLowerCase() === "nova" ? "acaonova.png" : row.selo.toLowerCase() === "renovada" ? "acaorenovada.png" : "")) : "";
    const segmentoRaw = row.segmento && String(row.segmento).trim() !== "" ? String(row.segmento).trim() : "";
    
    return cardHtml.replaceAll("{{TEXTO}}", String(row.texto ?? ""))
      .replaceAll("{{VALOR}}", valorFinal)
      .replaceAll("{{COMPLEMENTO}}", String(row.complemento ?? ""))
      .replaceAll("{{LEGAL}}", String(row.legal ?? ""))
      .replaceAll("{{SEGMENTO}}", segmentoRaw)
      .replaceAll("{{CUPOM}}", String(row.cupom ?? ""))
      .replaceAll("{{UF}}", row.uf ? `UF: ${row.uf}` : "")
      .replaceAll("{{URN}}", row.urn ? `URN: ${row.urn}` : "")
      .replaceAll("{{LOGO}}", logoBase64)
      .replaceAll("{{SELO}}", seloBase64);
  }
}
