
export type StreamMessage = {
  id: number;
  type: "open" | "data" | "close";
  data?: Buffer;
};
