import { encode } from "@msgpack/msgpack";
import { Duplex } from "stream";
import { BoredMplex } from "./bored-mplex";

export class Stream extends Duplex {
  constructor(public id: string, private session: BoredMplex) {
    super({
      emitClose: true
    });

    this.on("finish", () => {
      if (this.writableEnded) {
        return;
      }

      session.push(encode({
        id,
        type: "close"
      }));
    });
  }

  openStream() {
    this.session.push(encode({
      id: this.id,
      type: "open"
    }));
  }

  public _read(): void {
    //
  }

  public _write(chunk: any, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.session.push(encode({
      id: this.id,
      type: "data",
      data: chunk
    }));

    callback();
  }
}
