import "dotenv/config";
import { Client, GatewayIntentBits } from "discord.js";

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const CHANNEL_ID = "1438633619139723494"; // #geral

const message = `--- PROTOCOLO DE OPERAÇÃO ---

REI gerencia ciclos semanais de produção. O sistema é automático. Não há negociação.

FLUXO DO CICLO

1. Abertura — REI anuncia o início do ciclo.
2. Declaração — 24h para declarar seu projeto.
3. Produção — Período de trabalho. Submeta sua entrega antes do prazo.
4. Review — REI atribui 2 entregas para você revisar.
5. Encerramento — Relatório gerado. Estados ajustados.

O QUE CONTA COMO PROJETO

Um projeto é qualquer produção concreta dentro das áreas de produtividade do servidor:
- #visual — ilustração, design, fotografia, vídeo, animação.
- #sonoro — composição, mix, sound design, gravação.
- #tátil — escultura, modelagem, protótipo físico, craft.
- #textual — escrita, roteiro, artigo, poesia, documentação.
- #tecnomatemático — código, algoritmo, ferramenta, modelo, análise.

Requisitos mínimos para declaração:
- Título claro do que será produzido.
- Descrição breve do escopo (1-2 frases).
- Artefato esperado: o que você vai entregar no final (ex: "arquivo .png da ilustração", "repositório com o código", "pdf do texto").

O projeto deve ser concluível dentro de 1 ciclo (7 dias). Não declare o que não pretende terminar.

A categoria Projetos (#the-great-lock-in, #hypnagogia) é reservada para projetos especiais de longo prazo. Estes não substituem a declaração semanal no ciclo.

COMANDOS

/projeto declarar — Declarar projeto (título, descrição, artefato esperado).
/entrega submeter — Submeter entrega (link ou arquivo).
/review pendentes — Ver reviews atribuídas a você.
/review enviar — Submeter review de uma entrega.
/ciclo info — Ver prazos do ciclo atual.
/ciclo status — Ver seu estado no ciclo.

REGRA DE PRESENÇA

Para permanecer Ativo, cumpra 2 de 3 por ciclo:
- Entregar
- Revisar
- Ensinar

Falha em 2 ciclos consecutivos: estado ajustado para Observador.
Observadores não declaram projetos e não participam de decisões.

O tempo avança. O sistema registra.
---`;

client.once("ready", async () => {
  const channel = await client.channels.fetch(CHANNEL_ID);
  if (channel?.isTextBased() && "send" in channel) {
    await channel.send(message);
    console.log("Mensagem enviada em #geral.");
  } else {
    console.log("Canal não encontrado ou sem permissão.");
  }
  process.exit(0);
});

client.login(process.env.BOT_TOKEN);
