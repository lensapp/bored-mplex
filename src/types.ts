export type PeerFeatures = {
  window?: boolean;
  end?: boolean;
};

export type StreamMessage =
  | {
    id: number;
    type: "open" | "data" | "end" | "close" | "ping" | "pong" | "window";
    data?: Buffer;
  }
  | {
    id: number;
    type: "hello";
    data?: PeerFeatures;
  };
