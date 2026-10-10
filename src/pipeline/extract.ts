import { readFile } from "node:fs/promises";
import path from "node:path";

// Text pulled from one source file. `page` is the 1-based page for PDFs and
// null for formats without pages.
export interface ExtractedPage {
  page: number | null;
  text: string;
}

export const SUPPORTED_EXTENSIONS = [".pdf", ".docx", ".md", ".txt"] as const;

export async function extractText(filePath: string): Promise<ExtractedPage[]> {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".md":
    case ".txt":
      return [{ page: null, text: await readFile(filePath, "utf8") }];
    case ".docx": {
      const mammoth = await import("mammoth");
      const { value } = await mammoth.extractRawText({ path: filePath });
      return [{ page: null, text: value }];
    }
    case ".pdf": {
      const { extractText: extractPdf, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(await readFile(filePath)));
      const { text } = await extractPdf(pdf, { mergePages: false });
      return text.map((pageText, i) => ({ page: i + 1, text: pageText }));
    }
    default:
      throw new Error(`Unsupported file type ${ext} (${path.basename(filePath)}); supported: ${SUPPORTED_EXTENSIONS.join(", ")}`);
  }
}
