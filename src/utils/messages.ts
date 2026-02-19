export const messages = {
  cycleOpened: (n: number, deadline: string) =>
    `Ciclo ${n} iniciado. Declarações abertas até ${deadline}.`,
  declarationClosed: (count: number) =>
    `Período de declaração encerrado. ${count} projetos registrados.`,
  reviewPhaseStarted: () => `Fase de revisão iniciada. Entregas atribuídas.`,
  cycleClosed: (n: number) => `Ciclo ${n} encerrado.`,
  reminder48h: (n: number, pending: number) =>
    `48 horas para encerramento do ciclo ${n}. ${pending} entregas pendentes.`,
  dailyReviewReminder: (n: number, usersWithPendingReviews: number) =>
    `Lembrete diário do ciclo ${n}: ${usersWithPendingReviews} membro(s) ainda com revisões pendentes.`,
  noDeliveries: () => `Nenhuma entrega registrada. Fase de revisão ignorada.`,

  projectDeclared: (title: string) => `Projeto registrado: ${title}.`,
  projectAlreadyDeclared: () => `Projeto já declarado neste ciclo.`,
  deliverySubmitted: () => `Entrega registrada.`,
  deliveryAlreadySubmitted: () => `Entrega já registrada.`,
  reviewSubmitted: () => `Revisão registrada.`,
  reviewAlreadySubmitted: () => `Revisão já registrada.`,
  teachbackRegistered: (topic: string) => `Ensino registrado: ${topic}.`,
  teachbackAlreadyRegistered: () => `Ensino já registrado neste ciclo.`,

  observerCannotDeclare: () => `Observadores não podem declarar projetos.`,
  outsideDeclarationPeriod: () => `Fora do período de declaração.`,
  outsideProductionPeriod: () => `Fora do período de produção.`,
  outsideReviewPeriod: () => `Fora do período de revisão.`,
  outsideProductionOrReview: () => `Disponível apenas durante produção ou revisão.`,
  noCycleActive: () => `Nenhum ciclo ativo.`,
  noProjectDeclared: () => `Nenhum projeto declarado neste ciclo.`,
  assignmentNotFound: () => `Atribuição não encontrada.`,
  provideInput: () => `Informe um link ou arquivo.`,
  configUpdated: () => `Configuração atualizada.`,
  internalError: () => `Erro interno. Registro gerado.`,

  stateToObserver: () => `Estado ajustado para Observador.`,
  stateToActive: () => `Estado ajustado para Ativo.`,

  reviewAssigned: (title: string, deliveryId: number) =>
    `Revisão atribuída. Entrega: ${title} (ID: ${deliveryId}).`,

  noPermission: () => `Sem permissão.`,
  guildOnly: () => `Comando disponível apenas em servidores.`,
} as const;
