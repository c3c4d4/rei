import type { Command } from "../types/commands.js";
import { projeto } from "./projeto.js";
import { entrega } from "./entrega.js";
import { review } from "./review.js";
import { ciclo } from "./ciclo.js";
import { admin } from "./admin.js";

export function loadCommands(): Command[] {
  return [projeto, entrega, review, ciclo, admin];
}
