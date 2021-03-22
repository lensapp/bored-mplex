
export type StreamMessage = {
  id: string;
  type: "open" | "data" | "close";
  data?: Buffer;
};
