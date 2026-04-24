import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";

import { CardGenerator } from "./cardGenerator";

describe("CardGenerator", () => {
  it("normaliza os tipos de card suportados", () => {
    const generator = new CardGenerator();

    expect(generator.normalizeType("Promoção")).toBe("promocao");
    expect(generator.normalizeType("Cupom")).toBe("cupom");
    expect(generator.normalizeType("Queda de preço")).toBe("queda");
    expect(generator.normalizeType("Cashback especial")).toBe("cashback");
    expect(generator.normalizeType("BC")).toBe("bc");
    expect(generator.normalizeType("tipo inválido")).toBe("");
  });

  it("converte imagem existente para base64", () => {
    const generator = new CardGenerator();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "card-generator-"));
    const imagePath = path.join(tempDir, "logo.png");

    fs.writeFileSync(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const encoded = generator.imageToBase64(imagePath);

    expect(encoded).toMatch(/^data:image\/png;base64,/);

    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});
