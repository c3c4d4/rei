import type { ChatInputCommandInteraction } from "discord.js";
import { PermissionFlagsBits } from "discord.js";

export function requireGuild(
  interaction: ChatInputCommandInteraction
): interaction is ChatInputCommandInteraction & { guildId: string } {
  return interaction.guildId !== null;
}

export function requireAdmin(interaction: ChatInputCommandInteraction): boolean {
  return !!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
}
