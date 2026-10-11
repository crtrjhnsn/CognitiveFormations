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
  return extractPages(path.basename(filePath), new Uint8Array(await readFile(filePath)));
}

// Extracts text by file type, chosen from the filename's extension.
export async function extractPages(filename: string, bytes: Uint8Array): Promise<ExtractedPage[]> {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case ".md":
    case ".txt":
      return [{ page: null, text: new TextDecoder().decode(bytes) }];
    case ".docx": {
      const mammoth = await import("mammoth");
      const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
      return [{ page: null, text: value }];
    }
    case ".pdf": {
      const { extractText: extractPdf, getDocumentProxy } = await import("unpdf");
      // unpdf takes ownership of the buffer, so give it a copy.
      const pdf = await getDocumentProxy(new Uint8Array(bytes));
      const { text } = await extractPdf(pdf, { mergePages: false });
      return text.map((pageText, i) => ({ page: i + 1, text: pageText }));
    }
    default:
      throw new Error(`Unsupported file type ${ext || "(none)"} for ${filename}; supported: ${SUPPORTED_EXTENSIONS.join(", ")}`);
  }
}
