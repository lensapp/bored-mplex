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
  private frameSent = new Map<Buffer, () => void>();
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
      this.streams.forEach((stream) => stream.shutdown());
      this.dropQueue();
    });
    this.on("finish", () => {
      this.streams.forEach((stream) => stream.shutdown());
      this.dropQueue();
    });
  }

  pushToQueue(data: DRRData<Buffer>, onSent?: () => void) {
    if (this.destroyed || this.writableEnded) return onSent?.();

    if (onSent) this.frameSent.set(data.data, onSent);
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

      this.releaseFrame(data);

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

  private releaseFrame(frame: Buffer) {
    const onSent = this.frameSent.get(frame);

    if (!onSent) return;

    this.frameSent.delete(frame);
    onSent();
  }

  // The dropped frames' writers are released as if sent, as writes after the
  // session ended always were: failing them would emit errors on every stream.
  private dropQueue() {
    const onSent = [...this.frameSent.values()];

    this.queue = new DRRQueue<Buffer>();
    this.frameSent.clear();
    onSent.forEach((release) => release());
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
        stream.shutdown();
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
