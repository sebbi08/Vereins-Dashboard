import path from "path";

export const DATA_DIR =
  process.env.DATA_DIR || path.join(__dirname, "../../data");

export const VORLAGEN_DIR = path.join(DATA_DIR, "vorlagen");
export const QUITTUNGEN_DIR = path.join(DATA_DIR, "quittungen");

export const CONTEXT_DIR =
  process.env.CONTEXT_DIR || path.join(__dirname, "../../context");
