import { BoredMplexClient } from "../bored-mplex-client";
import { unpack } from "msgpackr";
import { PassThrough } from "stream";
import { StreamMessage } from "../types";

describe("BoredMplexClient", () => {
  let mplex: BoredMplexClient;

  beforeEach(() => {
    mplex = new BoredMplexClient();
  });

  afterEach(() => {
    mplex.end();
  });

  it("transforms chunks", (done) => {
    const incoming = new PassThrough();
    const outgoing = new PassThrough();
    const stream = mplex.openStream();

    mplex.pipe(outgoing);
    incoming.pipe(stream);

    outgoing.on("data", (chunk: Buffer) => {
      const msg = unpack(chunk) as StreamMessage;

      if (msg.type === "data") {
        expect(msg.data?.toString()).toEqual("random data");

        done();
      }
    });

    incoming.write("random data");
  });

  describe("openStream", () => {
    it("returns a stream with id", () => {
      expect(mplex.openStream().id).toEqual(1);
      expect(mplex.openStream().id).toEqual(2);
    });
  });
});
