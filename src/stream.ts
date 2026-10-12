import { pack } from "msgpackr";
import { Duplex } from "stream";
import { BoredMplex } from "./bored-mplex";

export class Stream extends Duplex {
  private closeSent = false;

  constructor(public id: number, private session: BoredMplex) {
    super({
      emitClose: true
    });

    this.on("finish", () => this.sendClose());
  }

  private sendClose() {
    if (this.closeSent || this.session.writableEnded) {
      return;
    }

    this.closeSent = true;
    this.pushToSession("close");
  }

  private pushToSession(type: string, data?: Buffer, onSent?: () => void) {
    this.session.pushToQueue({
      id: this.id.toString(), 
      data: pack({
        id: this.id,
        type,
        data
      }),
      size: !!data ? data.byteLength : 1
    }, onSent);
  }

  openStream(data?: Buffer) {
    this.pushToSession("open", data);
  }

  shutdown() {
    this.push(null);
    this.end();
  }

  public _read(): void {
    //
  }

  public _write(chunk: any, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    // Hold the writer until the frame leaves the session queue, so a writer
    // faster than the transport waits instead of growing the queue.
    this.pushToSession("data", chunk, callback);
  }

  public _destroy(error: Error | null, callback: (error: Error | null) => void): void {
    this.sendClose();

    callback(error);
  }
}
