import { Transform, TransformCallback, TransformOptions } from "stream";
import { pack, unpack } from "msgpackr";
import { Stream } from "./stream";
import { StreamMessage } from "./types";

export class BoredMplex extends Transform {
  public streams: Map<number, Stream> = new Map();

  private pingInterval?: NodeJS.Timeout;
  private pingTimeout?: NodeJS.Timeout;

  constructor(private onStream?: (stream: Stream) => void, opts?: TransformOptions) {
    super(opts);

    this.on("error", () => {
      this.streams.forEach((stream) => stream.end());
    });
    this.on("finish", () => {
      this.streams.forEach((stream) => stream.end());
    });
  }

  enableKeepAlive(interval = 10_000) {
    this.pingInterval = setInterval(() => {
      this.pingTimeout = setTimeout(() => {
        if (this.pingInterval) clearInterval(this.pingInterval);
        this.emit("timeout");
        this.end();
      }, 2_000);
      this.ping();
      this.once("pong", () => {
        if (this.pingTimeout) clearTimeout(this.pingTimeout);
      });
    }, interval);
  }

  disableKeepAlive() {
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.pingTimeout) clearTimeout(this.pingTimeout);
  }

  ping() {
    if (this.writableEnded) {
      return;
    }

    this.push(pack({
      id: 0,
      type: "ping"
    }));
  }

  pong() {
    if (this.writableEnded) {
      return;
    }

    this.push(pack({
      id: 0,
      type: "pong"
    }));
  }

  _transform(chunk: Buffer, encoding: BufferEncoding, callback: TransformCallback): void {
    const msg = unpack(chunk) as StreamMessage;
    let stream = this.streams.get(msg.id);

    switch (msg.type) {
      case "ping": {
        this.emit("ping");
        this.pong();

        return callback();
      }

      case "pong": {
        this.emit("pong");

        return callback();
      }
    }

    if (!stream && msg.type === "open") {
      stream = this.createStream(msg.id);

      return callback();
    }

    if (!stream) {
      return callback();
    }

    switch (msg.type) {
      case "data": {
        if (msg.data) {
          stream.push(msg.data);
        }
        break;
      }

      case "close": {
        stream.end();
        this.streams.delete(msg.id);

        break;
      }
    }

    callback();
  }

  protected createStream(id: number): Stream {
    const stream = new Stream(id, this);

    this.streams.set(id, stream);
    this.onStream?.(stream);

    return stream;
  }
}
