export const NOTIFY_KINDS = {
  message_inbound: { sound: "message", tagPrefix: "msg" },
  alerts_toggle: { sound: "success", tagPrefix: "alerts" },
  lead_assigned: { sound: "attention", tagPrefix: "lead-assigned" },
  lead_won: { sound: "success", tagPrefix: "lead-won" },
  lead_lost: { sound: "failure", tagPrefix: "lead-lost" },
  mention: { sound: "attention", tagPrefix: "mention" },
  assistente_precisa_de_voce: { sound: "attention", tagPrefix: "assistant-needs-you" },
} as const;

export type NotifyKind = keyof typeof NOTIFY_KINDS;
