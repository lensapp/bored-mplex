import { pack } from "msgpackr";
import { Duplex } from "stream";
import { BoredMplex } from "./bored-mplex";

export class Stream extends Duplex {
  constructor(public id: number, private session: BoredMplex) {
    super({
      emitClose: true
    });

    this.on("finish", () => {
      if (session.writableEnded) {
        return;
      }

      this.pushToSession("close");
    });
  }

  private pushToSession(type: string, data?: Buffer) {
    this.session.pushToQueue({
      id: this.id.toString(), 
      data: pack({
        id: this.id,
        type,
        data
      }),
      size: !!data ? data.byteLength : 1
    });
  }

  openStream(data?: Buffer) {
    this.pushToSession("open", data);
  }

  public _read(): void {
    //
  }

  public _write(chunk: any, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    if (this.session.writableEnded) return;

    this.pushToSession("data", chunk);

    callback();
  }
}
