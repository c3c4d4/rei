import { EmbedBuilder } from "discord.js";

export const Color = {
  SUCCESS:      0x2D4F3E,
  ERROR:        0x8B2D2D,
  INFO:         0x2B3D50,
  WARNING:      0x6B5B3A,
  ANNOUNCEMENT: 0x1A1A2E,
} as const;

const FOOTER_TEXT = "REI // Peer Learning";

function base(color: number): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(color)
    .setFooter({ text: FOOTER_TEXT })
    .setTimestamp();
}

function success(description: string): EmbedBuilder {
  return base(Color.SUCCESS).setDescription(description);
}

function error(description: string): EmbedBuilder {
  return base(Color.ERROR).setDescription(description);
}

function info(title: string, description?: string): EmbedBuilder {
  const embed = base(Color.INFO).setTitle(title);
  if (description) embed.setDescription(description);
  return embed;
}

function warning(description: string): EmbedBuilder {
  return base(Color.WARNING).setDescription(description);
}

function announcement(title: string, description?: string): EmbedBuilder {
  const embed = base(Color.ANNOUNCEMENT).setTitle(title);
  if (description) embed.setDescription(description);
  return embed;
}

function report(title: string): EmbedBuilder {
  return base(Color.ANNOUNCEMENT).setTitle(title);
}

function stateChange(description: string): EmbedBuilder {
  return base(Color.ANNOUNCEMENT).setDescription(description);
}

export const rei = {
  success,
  error,
  info,
  warning,
  announcement,
  report,
  stateChange,
} as const;
