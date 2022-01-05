import { BoredMplex } from "./bored-mplex";
import { Stream } from "./stream";

export class BoredMplexClient extends BoredMplex {
  private nextStreamID = 1;

  constructor() {
    super();
  }

  openStream(data?: Buffer): Stream {
    const stream = new Stream(this.nextStreamID++, this);

    this.streams.set(stream.id, stream);
    stream.openStream(data);

    return stream;
  }
}
