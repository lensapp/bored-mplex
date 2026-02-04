import { Transform, TransformCallback, TransformOptions } from "stream";
import { pack, UnpackrStream } from "msgpackr";
import { DRRData, DRRQueue } from "@divine/synchronization";
import { Stream } from "./stream";
import { StreamMessage } from "./types";

export class BoredMplex extends Transform {
  public streams: Map<number, Stream> = new Map();
  public queue = new DRRQueue<Buffer>(this.writableHighWaterMark);

  private pingInterval?: NodeJS.Timeout;
  private pingTimeout?: NodeJS.Timeout;
  private processPending = false;
  private unpackrStream: UnpackrStream;

  constructor(private onStream?: (stream: Stream, data?: Buffer) => void, opts?: TransformOptions) {
    super(opts);

    this.unpackrStream = new UnpackrStream({ mapsAsObjects: true });
    this.unpackrStream.on("data", (msg: StreamMessage) => {
      this.handleMessage(msg);
    });
    this.unpackrStream.on("error", (err) => {
      this.emit("error", err);
    });

    this.on("error", () => {
      this.streams.forEach((stream) => stream.end());
      this.queue = new DRRQueue<Buffer>();
    });
    this.on("finish", () => {
      this.streams.forEach((stream) => stream.end());
      this.queue = new DRRQueue<Buffer>();
    });
  }

  pushToQueue(data: DRRData<Buffer>) {
    this.queue.push(data);

    this.process();
  }

  private process() {
    if (this.processPending) return;

    this.processPending = true;

    this.processQueue();
  }

  private processQueue() {
    if (this.writableEnded) {
      return;
    }

    const data = this.queue.shift();

    if (data) {
      const ok = this.push(data);

      if (!ok) {
        this.once("drain", () => {
          setImmediate(() => this.processQueue());
        });

        return;
      }
    }

    if (this.queue.length > 0) {
      setImmediate(() => this.processQueue());
    } else {
      this.processPending = false;
    }
  }

  _read(size: number) {
    this.emit("drain");
    super._read(size);
  }

  enableKeepAlive(interval = 10_000, timeout = 2_000) {
    this.pingInterval = setInterval(() => {
      this.pingTimeout = setTimeout(() => {
        if (this.pingInterval) clearInterval(this.pingInterval);
        this.emit("timeout");
        this.end();
      }, timeout);
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

  _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
    this.unpackrStream.write(chunk, callback);
  }

  private handleMessage(msg: StreamMessage): void {
    const stream = this.streams.get(msg.id);

    switch (msg.type) {
      case "ping": {
        this.emit("ping");
        this.pong();

        return;
      }

      case "pong": {
        this.emit("pong");

        return;
      }
    }

    if (!stream && msg.type === "open") {
      this.createStream(msg.id, msg.data);

      return;
    }

    if (!stream) {
      return;
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
  }

  protected createStream(id: number, data?: Buffer): Stream {
    const stream = new Stream(id, this);

    this.streams.set(id, stream);
    this.onStream?.(stream, data);

    return stream;
  }
}
