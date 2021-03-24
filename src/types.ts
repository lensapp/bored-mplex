
export type StreamMessage = {
  id: number;
  type: "open" | "data" | "close" | "ping" | "pong";
  data?: Buffer;
};
