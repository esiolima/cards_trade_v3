import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { CardGenerator } from "../cardGenerator";
import path from "path";
import fs from "fs";
import { TRPCError } from "@trpc/server";

const activeGenerators = new Map<string, CardGenerator>();

export const cardRouter = router({
  generateCards: publicProcedure
    .input(
      z.object({
        filePath: z.string(),
        sessionId: z.string(),
        originalFileName: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { filePath, sessionId, originalFileName } = input;

      if (!fs.existsSync(filePath)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Arquivo não encontrado",
        });
      }
      if (!filePath.endsWith(".xlsx")) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Apenas arquivos .xlsx são suportados",
        });
      }

      try {
        const generator = new CardGenerator();
        activeGenerators.set(sessionId, generator);
        await generator.initialize();

        generator.on("progress", (progress) => {
          ctx.io?.to(sessionId).emit("progress", progress);
        });

        const zipPath = await generator.generateCards(filePath, originalFileName);

        await generator.close();
        activeGenerators.delete(sessionId);

        return {
          success: true,
          zipPath,
          fileName: path.basename(zipPath),
        };
      } catch (error) {
        activeGenerators.delete(sessionId);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error ? error.message : "Erro ao processar cards",
        });
      }
    }),

  // 🔥 NOVO — GERAR JORNAL
  generateJornal: publicProcedure
    .input(
      z.object({
        filePath: z.string(),
        sessionId: z.string(),
        headerPath: z.string().optional(),
        backgroundColor: z.string().optional(),
        categoryBoxColor: z.string().optional(),
        footerText: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { filePath, sessionId, headerPath, backgroundColor, categoryBoxColor, footerText } = input;

      if (!fs.existsSync(filePath)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Arquivo não encontrado",
        });
      }

      try {
        const generator = new CardGenerator();
        activeGenerators.set(sessionId, generator);
        await generator.initialize();

        const jornalPath = await generator.generateJornal(filePath, {
          headerPath,
          backgroundColor,
          categoryBoxColor,
          footerText
        });

        await generator.close();
        activeGenerators.delete(sessionId);

        return {
          success: true,
          jornalPath,
          fileName: path.basename(jornalPath),
        };
      } catch (error) {
        activeGenerators.delete(sessionId);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error ? error.message : "Erro ao gerar jornal",
        });
      }
    }),

  downloadZip: publicProcedure
    .input(
      z.object({
        zipPath: z.string(),
      })
    )
    .query(async ({ input }) => {
      const { zipPath } = input;

      const outputDir = path.resolve("output");
      const resolvedPath = path.resolve(zipPath);

      if (!resolvedPath.startsWith(outputDir)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Acesso negado",
        });
      }

      if (!fs.existsSync(resolvedPath)) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Arquivo não encontrado",
        });
      }

      return {
        success: true,
        exists: true,
      };
    }),
});
