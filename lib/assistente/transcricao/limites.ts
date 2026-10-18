/** Limites do áudio gravado no chat — o navegador e a rota leem os MESMOS números. */

/** Tempo máximo de gravação. */
export const SEGUNDOS_MAXIMOS_DA_GRAVACAO = 120;

/** 8 MB: 2 minutos de opus cabem em bem menos, e o serviço de transcrição aceita até 25 MB. */
export const TAMANHO_MAXIMO_DO_AUDIO = 8 * 1024 * 1024;

/** O que o `MediaRecorder` produz (webm/opus no Chrome e Firefox, mp4 no Safari) e o que a transcrição lê. */
export const MIMES_DE_AUDIO_ACEITOS: string[] = [
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/x-m4a",
];
