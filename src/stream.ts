import { pack } from "msgpackr";
import { Duplex } from "stream";
import { BoredMplex } from "./bored-mplex";

export class Stream extends Duplex {
  constructor(public id: number, private session: BoredMplex) {
    super({
      emitClose: true
    });

    this.on("finish", () => {
      if (this.writableEnded) {
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

  public _write(chunk: any, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    if (this.writableEnded) return;

    this.session.push(pack({
      id: this.id,
      type: "data",
      data: chunk
    }));

    callback();
  }
}
