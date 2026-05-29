export interface RawGrepaiResult {
  file_path: string;
  start_line: number;
  end_line: number;
  score: number;
  content: string;
}

export interface NormalizedGrepaiResult {
  id: string;
  filePath: string;
  displayPath: string;
  startLine: number;
  endLine: number;
  score: number;
  preview: string;
}

export interface SearchArgsInput {
  query: string;
  limit: number;
}
