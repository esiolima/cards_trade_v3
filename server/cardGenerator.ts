// 🔥 ALTERAÇÃO PRINCIPAL: JOURNAL COM BASE64

async generateJornal(): Promise<string> {
  if (!this.browser) throw new Error("Browser not initialized");

  const files = fs
    .readdirSync(IMG_DIR)
    .filter((f) => f.endsWith(".png"));

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
      }

      img {
        width: 100%;
      }
    </style>
  </head>
  <body>
  `;

  let count = 0;
  html += `<div class="page"><div class="grid">`;

  for (const file of files) {
    const filePath = path.join(IMG_DIR, file);

    // 🔥 CONVERTE PARA BASE64
    const buffer = fs.readFileSync(filePath);
    const base64 = `data:image/png;base64,${buffer.toString("base64")}`;

    html += `<div class="card"><img src="${base64}" /></div>`;

    count++;

    if (count === 18) {
      html += `</div></div><div class="page"><div class="grid">`;
      count = 0;
    }
  }

  html += `</div></div></body></html>`;

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
