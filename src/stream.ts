import { pack } from "msgpackr";
import { Duplex } from "stream";
import { BoredMplex } from "./bored-mplex";

type BufferItem = {
  chunk: Buffer;
  encoding: BufferEncoding;
  callback: WriteCallback;
};

type WriteCallback = (error?: Error | null) => void;

export class Stream extends Duplex {
  private buffer?: BufferItem[];

  constructor(public id: number, private session: BoredMplex) {
    super({
      emitClose: true,
      writableHighWaterMark: 1024 * 1024 * 8,
      readableHighWaterMark: 1024 * 1024 * 8
    });

    this.on("sessionDrained", () => {
      this.flushBuffer();
    });

    this.on("finish", () => {
      if (session.writableEnded) {
        return;
      }

      session.push(pack({
        id,
        type: "close"
      }));
    });
  }

  openStream() {
    this.session.push(pack({
      id: this.id,
      type: "open"
    }));
  }

  public _read(): void {
    //
  }

  public _write(chunk: any, encoding: BufferEncoding, callback: WriteCallback): void {
    this.pushWithBackpressure(chunk, encoding, callback);
  }

  private pushWithBackpressure(chunk: Buffer, encoding: BufferEncoding, callback: WriteCallback) {
    if (this.session.writableEnded) {
      return;
    }

    if (this.buffer !== undefined) {
      this.buffer.push({ chunk, encoding, callback });

      return;
    }

    const pushed = this.session.push(pack({
      id: this.id,
      type: "data",
      data: chunk
    }), encoding);

    if (!pushed) {
      this.buffer = [{ chunk, encoding, callback }];

      console.log("cannot push to session", this.id, this.buffer.length, this.session);
    } else {
      callback();
    }
  }

  private flushBuffer() {
    if (!this.buffer) {
      this.buffer = undefined;

      return;
    }
    console.log("DRAIN STREAM", this.id, this.buffer.length);

    const buffer = this.buffer;

    this.buffer = undefined;

    for (const item of buffer) {
      this.pushWithBackpressure(item.chunk, item.encoding, item.callback);
    }
  }
}
