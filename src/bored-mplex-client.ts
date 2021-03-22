import { BoredMplex } from "./bored-mplex";
import { Stream } from "./stream";
import { randomBytes } from "crypto";

export class BoredMplexClient extends BoredMplex {
  constructor() {
    super();
  }

  openStream(): Stream {
    const stream = new Stream(randomBytes(16).toString("hex"), this);

    this.streams.set(stream.id, stream);
    stream.openStream();

    return stream;
  }
}
