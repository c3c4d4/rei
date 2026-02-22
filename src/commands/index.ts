import type { Command } from "../types/commands.js";
import { projectCommand } from "./project.js";
import { deliveryCommand } from "./delivery.js";
import { review } from "./review.js";
import { blackholeCommand } from "./blackhole.js";
import { profileCommand } from "./profile.js";
import { poolCommand } from "./pool.js";
import { admin } from "./admin.js";

export function loadCommands(): Command[] {
  return [projectCommand, deliveryCommand, review, blackholeCommand, profileCommand, poolCommand, admin];
}
