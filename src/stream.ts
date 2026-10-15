import { pack } from "msgpackr";
import { Duplex } from "stream";
import { BoredMplex } from "./bored-mplex";

// The bytes a stream may send before the peer's reader has taken any. Both
// peers must use the same value.
export const STREAM_WINDOW = 256 * 1024;

// The data of a "close" that only ends the sending side. A peer with "end"
// takes it as "end"; older peers ignore the data and close.
export const CLOSE_AS_END = Buffer.from([1]);

type WriteCallback = (error?: Error | null) => void;

export class Stream extends Duplex {
  private closeSent = false;
  private closeReceived = false;
  private endSent = false;
  private endReceived = false;
  private sendCredit = STREAM_WINDOW;
  private heldWrite?: { chunk: Buffer; callback: WriteCallback };
  private received = 0;
  private granted = 0;

  constructor(public id: number, private session: BoredMplex) {
    super({
      emitClose: true
    });

    this.on("finish", () => this.sendEnd());
  }

  // Before the peer's hello arrives, this side cannot know if the peer has
  // "end", so it sends "close" with CLOSE_AS_END. A received "close" is always
  // answered with "close".
  private sendEnd() {
    if (this.closeReceived) {
      this.sendClose();

      return;
    }

    if (this.endSent || this.session.writableEnded) {
      return;
    }

    this.endSent = true;
    if (this.session.peerHasEnd) this.pushToSession("end");
    else this.pushToSession("close", CLOSE_AS_END);
    this.forgetWhenBothEnded();
  }

  // With "end" support, the side that sends "close" forgets the stream at once.
  private sendClose() {
    if (this.closeSent || this.session.writableEnded) {
      return;
    }

    if (this.session.peerHasEnd) {
      if (this.endSent && this.endReceived) return;

      this.session.streams.delete(this.id);
    }

    this.closeSent = true;
    this.pushToSession("close");
  }

  // A peer that already sent "end" does not answer a "close" that was sent
  // before its hello arrived.
  private forgetWhenBothEnded() {
    if ((this.endSent || this.closeSent) && this.endReceived) this.session.streams.delete(this.id);
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

  // The peer sends no more credit for this stream, so send what is left.
  shutdown() {
    this.addCredit(Infinity);
    this.push(null);
    this.end();
  }

  receiveEnd() {
    this.endReceived = true;
    this.push(null);
    this.forgetWhenBothEnded();
  }

  receiveClose() {
    this.closeReceived = true;
    this.shutdown();
  }

  receive(data: Buffer) {
    if (this.endReceived) return;

    this.received += data.byteLength;
    this.push(data);
    this.grantWindow();
  }

  addCredit(bytes: number) {
    this.sendCredit += bytes;

    const held = this.heldWrite;

    if (!held) return;

    this.heldWrite = undefined;
    this.sendData(held.chunk, held.callback);
  }

  // Bytes still in the readable buffer are not taken yet, so they get no
  // credit: a reader that stops reading stops the peer.
  private grantWindow() {
    if (!this.session.peerHasWindow) return;

    const taken = this.received - this.readableLength;
    const credit = taken - this.granted;

    if (credit < STREAM_WINDOW / 2) return;

    const data = Buffer.alloc(4);

    data.writeUInt32BE(credit);
    this.granted = taken;
    this.pushToSession("window", data);
  }

  // Bytes are counted from the start of the stream, also before the peer
  // says that it counts, so both peers agree on the window.
  private sendData(chunk: Buffer, callback: WriteCallback) {
    const credit = this.session.peerHasWindow ? Math.max(this.sendCredit, 0) : chunk.byteLength;

    if (credit === 0) {
      this.heldWrite = { chunk, callback };

      return;
    }

    const part = chunk.subarray(0, credit);
    const rest = chunk.subarray(part.byteLength);

    this.sendCredit -= part.byteLength;

    if (rest.byteLength > 0) {
      this.pushToSession("data", part);
      this.sendData(rest, callback);

      return;
    }

    // Hold the writer until the frame leaves the session queue, so a writer
    // faster than the transport waits instead of growing the queue.
    this.pushToSession("data", part, callback);
  }

  // Node calls _read before it takes the chunk that the reader asked for out
  // of the buffer, so the taken bytes are known only after that.
  public _read(): void {
    process.nextTick(() => this.grantWindow());
  }

  public _write(chunk: Buffer, _encoding: BufferEncoding, callback: WriteCallback): void {
    this.sendData(chunk, callback);
  }

  public _destroy(error: Error | null, callback: (error: Error | null) => void): void {
    const held = this.heldWrite;

    this.heldWrite = undefined;
    held?.callback(error);
    this.sendClose();

    callback(error);
  }
}
