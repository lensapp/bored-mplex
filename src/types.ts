export type PeerFeatures = {
  window?: boolean;
};

export type StreamMessage =
  | {
    id: number;
    type: "open" | "data" | "close" | "ping" | "pong" | "window";
    data?: Buffer;
  }
  | {
    id: number;
    type: "hello";
    data?: PeerFeatures;
  };
