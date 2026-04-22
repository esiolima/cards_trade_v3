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
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    if (!fs.existsSync(TMP_DIR)) {
      fs.mkdirSync(TMP_DIR, { recursive: true });
    }

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
    const ext = path.extname(imagePath).replace(".", "");
    const buffer = fs.readFileSync(imagePath);
    return `data:image/${ext};base64,${buffer.toString("base64")}`;
  }

  // 🔹 compatível com router
  async processExcel(excelFilePath: string): Promise<string> {
    return await this.generateCards(excelFilePath);
  }

  async generateCards(excelFilePath: string): Promise<string> {
    if (!this.browser) throw new Error("Browser not initialized");

    // limpa saída
    fs.readdirSync(OUTPUT_DIR).forEach((file) => {
      const full = path.join(OUTPUT_DIR, file);
      if (fs.statSync(full).isFile()) {
        if (file.endsWith(".pdf") || file.endsWith(".zip")) {
          fs.unlinkSync(full);
        }
      }
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

      const logoBase64 = this.imageToBase64(
        path.join(LOGOS_DIR, row.logo || "blank.png")
      );

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
      await page.goto(`file://${tmpHtml}`, { waitUntil: "networkidle0" });

      const pdfPath = path.join(OUTPUT_DIR, `card_${processed}.pdf`);

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
    const archive = archiver("zip");

    archive.pipe(output);

    fs.readdirSync(OUTPUT_DIR).forEach((file) => {
      const full = path.join(OUTPUT_DIR, file);
      if (fs.statSync(full).isFile() && file.endsWith(".pdf")) {
        archive.file(full, { name: file });
      }
    });

    await archive.finalize();

    return zipPath;
  }

  // 🔹 JORNAL SIMPLES ESTÁVEL
  async generateJornal(): Promise<string> {
    if (!this.browser) throw new Error("Browser not initialized");

    const files = fs
      .readdirSync(OUTPUT_DIR)
      .filter((f) => {
        const full = path.join(OUTPUT_DIR, f);
        return (
          fs.statSync(full).isFile() &&
          f.endsWith(".pdf") &&
          !f.includes("jornal")
        );
      });

    let html = `<html><body style="margin:0;">`;
    html += `<div style="display:flex;flex-wrap:wrap;">`;

    let count = 0;

    for (const file of files) {
      const filePath = path.join(OUTPUT_DIR, file);

      html += `
        <div style="width:33%;height:350px;">
          <iframe src="file://${filePath}" style="width:100%;height:100%;border:none;"></iframe>
        </div>
      `;

      count++;

      if (count === 18) {
        html += `</div><div style="page-break-after:always;"></div><div style="display:flex;flex-wrap:wrap;">`;
        count = 0;
      }
    }

    html += `</div></body></html>`;

    const jornalPath = path.join(OUTPUT_DIR, "jornal_ofertas.pdf");

    const page = await this.browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    await page.pdf({
      path: jornalPath,
      format: "A4",
      printBackground: true,
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
