import { Transform, TransformCallback, TransformOptions } from "stream";
import { pack, unpack } from "msgpackr";
import { Stream } from "./stream";
import { StreamMessage } from "./types";

type BufferItem = {
  id: number;
  chunk: Buffer;
  encoding: BufferEncoding;
  callback: TransformCallback;
};

export class BoredMplex extends Transform {
  public streams: Map<number, Stream> = new Map();

  private pingInterval?: NodeJS.Timeout;
  private pingTimeout?: NodeJS.Timeout;
  private streamBufferings: Map<number, BufferItem[]> = new Map();

  constructor(private onStream?: (stream: Stream) => void, opts?: TransformOptions) {
    super({
      writableHighWaterMark: 1024 * 1024 * 8,
      readableHighWaterMark: 1024 * 1024 * 8,
      ...opts
    });

    this.on("error", () => {
      this.streams.forEach((stream) => stream.end());
    });
    this.on("finish", () => {
      this.streams.forEach((stream) => stream.end());
    });
    this.on("drain", () => {
      for (const stream of this.streams.values()) {
        stream.emit("sessionDrained");
      }
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
          this.pushWithBackpressure(stream, msg.data, encoding, callback);
        } else {
          callback();
        }
        break;
      }

      case "close": {
        stream.end();
        this.streams.delete(msg.id);
        callback();

        break;
      }

      default: {
        callback();
      }
    }
  }

  private pushWithBackpressure(stream: Stream, chunk: Buffer, encoding: BufferEncoding, callback: TransformCallback) {
    if (stream.writableEnded) {
      callback();

      return;
    }

    if (this.streamBufferings.has(stream.id)) {
      const buffer = this.streamBufferings.get(stream.id);

      buffer?.push({id: stream.id, chunk, encoding, callback});

      return;
    }

    const pushed = stream.push(chunk, encoding);

    if (!pushed) {
      const buffer = this.streamBufferings.get(stream.id);

      if (!buffer) {
        callback();

        return;
      }

      buffer.push({id: stream.id, chunk, encoding, callback});
      this.streamBufferings.set(stream.id, buffer);
    } else {
      callback();
    }
  }

  protected createStream(id: number): Stream {
    const stream = new Stream(id, this);

    stream.on("drain", () => {
      const buffer = this.streamBufferings.get(id);

      if (!buffer) {
        return;
      }

      this.streamBufferings.delete(id);

      for (const item of buffer) {
        const stream = this.streams.get(item.id);

        if (!stream) {
          item.callback();

          continue;
        }

        this.pushWithBackpressure(stream, item.chunk, item.encoding, item.callback);
      }
    });

    stream.on("finish", () => {
      this.streamBufferings.delete(id);
    });

    this.streams.set(id, stream);
    this.onStream?.(stream);

    return stream;
  }
}
