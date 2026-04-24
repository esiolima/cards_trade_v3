import path from "path";
import fs from "fs";
import puppeteer, { Browser } from "puppeteer-core";
import archiver from "archiver";
import xlsx from "xlsx";
import { EventEmitter } from "events";

const BASE_DIR = path.resolve();
const OUTPUT_DIR = path.join(BASE_DIR, "output");
const TEMPLATES_DIR = path.join(BASE_DIR, "templates");
const LOGOS_DIR = path.join(BASE_DIR, "logos");
const SELOS_DIR = path.join(BASE_DIR, "selos");

export class CardGenerator extends EventEmitter {
  private browser: Browser | null = null;

  async initialize() {
    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        executablePath: "C:\\Users\\esiol\\.cache\\puppeteer\\chrome\\win64-147.0.7727.57\\chrome-win64\\chrome.exe",
        args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
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

  async processExcel(excelFilePath: string): Promise<any[]> {
    await this.initialize();
    const workbook = xlsx.readFile(excelFilePath);
    const rows: any[] = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: "" });
    const cards: any[] = [];
    
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const tipo = this.normalizeType(row.tipo);
      if (!tipo) continue;
      const templatePath = path.join(TEMPLATES_DIR, `${tipo}.html`);
      if (!fs.existsSync(templatePath)) continue;

      let html = fs.readFileSync(templatePath, "utf8");
      const logoBase64 = this.imageToBase64(path.join(LOGOS_DIR, this.findLogoFile(row.logo)));
      const seloBase64 = row.selo ? this.imageToBase64(path.join(SELOS_DIR, row.selo.toLowerCase() === "nova" ? "acaonova.png" : "acaorenovada.png")) : "";

      html = html.replaceAll("{{TEXTO}}", String(row.texto ?? ""))
                 .replaceAll("{{VALOR}}", String(row.valor ?? ""))
                 .replaceAll("{{COMPLEMENTO}}", String(row.complemento ?? ""))
                 .replaceAll("{{LEGAL}}", String(row.legal ?? ""))
                 .replaceAll("{{URN}}", String(row.urn ?? ""))
                 .replaceAll("{{UF}}", String(row.uf ?? ""))
                 .replaceAll("{{SEGMENTO}}", String(row.segmento ?? ""))
                 .replaceAll("{{LOGO}}", logoBase64)
                 .replaceAll("{{SELO}}", seloBase64);

      const page = await this.browser!.newPage();
      try {
        await page.setViewport({ width: 700, height: 1058 });
        await page.setContent(html, { waitUntil: "networkidle0" });
        const pdfName = `${i + 1}_${tipo}.pdf`;
        await page.pdf({ path: path.join(OUTPUT_DIR, pdfName), width: "700px", height: "1058px", printBackground: true });
        cards.push({ id: pdfName, template: tipo, data: row });
      } finally {
        await page.close();
      }
      this.emit("progress", { processed: i + 1, total: rows.length, percentage: Math.round(((i + 1) / rows.length) * 100) });
    }
    return cards;
  }

  async generateZip(): Promise<string> {
    const zipPath = path.join(OUTPUT_DIR, `cards_${Date.now()}.zip`);
    const output = fs.createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });
    return new Promise((resolve, reject) => {
      output.on("close", () => resolve(zipPath));
      archive.pipe(output);
      fs.readdirSync(OUTPUT_DIR).forEach(f => { if (f.endsWith(".pdf")) archive.file(path.join(OUTPUT_DIR, f), { name: f }); });
      archive.finalize();
    });
  }

  async generateJornalPreview(options: any): Promise<string> {
    await this.initialize();
    const excelFilePath = path.join(process.cwd(), "uploads_excel", "current_planilha.xlsx");
    const workbook = xlsx.readFile(excelFilePath);
    const rows: any[] = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: "" });

    const groupedRows: { [key: string]: any[] } = {};
    rows.forEach(row => {
      const cat = String(row.categoria || "OUTROS").toUpperCase();
      if (!groupedRows[cat]) groupedRows[cat] = [];
      groupedRows[cat].push(row);
    });

    const cardW = 700;
    const gap = 30;
    const totalW = (cardW * 3) + (gap * 2);

    let html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
      * { margin: 0; padding: 0; box-sizing: border-box; -webkit-print-color-adjust: exact; }
      body { 
        background: #064e3b; 
        width: ${totalW + 100}px; 
        padding: 60px 0;
        font-family: Arial, sans-serif;
        display: flex;
        flex-direction: column;
        align-items: center;
      }
      .container { width: ${totalW}px; }
      .cat-label { 
        background: ${options.categoryBoxColor || "#1d4ed8"}; 
        color: white; 
        width: 100%;
        height: 120px;
        line-height: 120px;
        font-size: 60px;
        font-weight: bold;
        text-align: center;
        border-radius: 20px;
        margin: 50px 0 30px 0;
        text-transform: uppercase;
      }
      .grid-table {
        border-collapse: separate;
        border-spacing: ${gap}px;
        margin-left: -${gap}px;
      }
      .card-item { 
        width: ${cardW}px; 
        height: 1058px; 
        background: white; 
        border-radius: 15px; 
        overflow: hidden;
        vertical-align: top;
      }
      .inner-card-wrapper { 
        width: 700px; 
        height: 1058px; 
        position: relative;
        overflow: hidden;
      }
      .footer { 
        width: ${totalW}px;
        margin-top: 100px;
        padding: 60px;
        border-top: 5px solid rgba(255,255,255,0.2);
        color: white;
        font-size: 40px;
        text-align: center;
      }
    </style></head><body><div class="container">`;

    for (const [category, items] of Object.entries(groupedRows)) {
      html += `<div class="cat-label">${category}</div>`;
      html += `<table class="grid-table"><tr>`;
      
      let count = 0;
      for (const item of items) {
        if (count > 0 && count % 3 === 0) {
          html += `</tr><tr>`;
        }

        const tipo = this.normalizeType(item.tipo);
        const tPath = path.join(TEMPLATES_DIR, `${tipo}.html`);
        if (!fs.existsSync(tPath)) continue;
        
        let cHtml = fs.readFileSync(tPath, "utf8");
        const logoBase64 = this.imageToBase64(path.join(LOGOS_DIR, this.findLogoFile(item.logo)));
        const seloBase64 = item.selo ? this.imageToBase64(path.join(SELOS_DIR, item.selo.toLowerCase() === "nova" ? "acaonova.png" : "acaorenovada.png")) : "";

        cHtml = cHtml.replaceAll("{{TEXTO}}", String(item.texto ?? ""))
                     .replaceAll("{{VALOR}}", String(item.valor ?? ""))
                     .replaceAll("{{COMPLEMENTO}}", String(item.complemento ?? ""))
                     .replaceAll("{{LEGAL}}", String(item.legal ?? ""))
                     .replaceAll("{{URN}}", String(item.urn ?? ""))
                     .replaceAll("{{UF}}", String(item.uf ?? ""))
                     .replaceAll("{{SEGMENTO}}", String(item.segmento ?? ""))
                     .replaceAll("{{LOGO}}", logoBase64)
                     .replaceAll("{{SELO}}", seloBase64)
                     .replace(/<html[^>]*>|<\/html>|<body[^>]*>|<\/body>|<!DOCTYPE[^>]*>/gi, "");

        html += `<td class="card-item"><div class="inner-card-wrapper">${cHtml}</div></td>`;
        count++;
      }
      html += `</tr></table>`;
    }

    html += `</div><div class="footer">${options.footerText || ""}</div></body></html>`;

    fs.writeFileSync(path.join(OUTPUT_DIR, "preview_jornal.html"), html);
    return "/output/preview_jornal.html";
  }

  async generateFinalPDF(): Promise<string> {
    await this.initialize();
    const page = await this.browser!.newPage();
    const previewContent = fs.readFileSync(path.join(OUTPUT_DIR, "preview_jornal.html"), "utf8");
    await page.setContent(previewContent, { waitUntil: "networkidle0" });
    
    const dimensions = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight
    }));

    const pdfPath = path.join(OUTPUT_DIR, "jornal_ofertas.pdf");
    await page.pdf({ 
      path: pdfPath, 
      width: dimensions.width + "px", 
      height: dimensions.height + "px", 
      printBackground: true 
    });
    await page.close();
    return pdfPath;
  }
}