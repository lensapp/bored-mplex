import { BoredMplexClient } from "../bored-mplex-client";
import { decode } from "@msgpack/msgpack";
import { PassThrough } from "stream";
import { StreamMessage } from "../types";

describe("BoredMplexClient", () => {
  it("transforms chunks", (done) => {
    const incoming = new PassThrough();
    const outgoing = new PassThrough();
    const mplex = new BoredMplexClient();
    const stream = mplex.openStream();

    mplex.pipe(outgoing);
    incoming.pipe(stream);

    outgoing.on("data", (chunk: Buffer) => {
      const msg = decode(chunk) as StreamMessage;

      if (msg.type === "data") {
        expect(msg.data?.toString()).toEqual("random data");

        done();
      }
    });

    incoming.write("random data");
  });
});
