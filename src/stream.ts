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

  private pushToSession(type: string, data?: Buffer): boolean {
    return this.session.pushToQueue({
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

    const hasCapacity = this.pushToSession("data", chunk);

    if (!hasCapacity) {
      let called = false;
      const onDrain = () => {
        if (called) return;
        called = true;
        this.session.removeListener("finish", onFinish);
        callback();
      };
      const onFinish = () => {
        if (called) return;
        called = true;
        this.session.removeListener("drain", onDrain);
        callback();
      };
      this.session.once("drain", onDrain);
      this.session.once("finish", onFinish);
      return;
    }

    callback();
  }
}
