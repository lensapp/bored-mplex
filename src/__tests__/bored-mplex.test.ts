import { BoredMplex } from "../bored-mplex";
import { pack, unpack } from "msgpackr";
import { PassThrough } from "stream";
import { StreamMessage } from "../types";

describe("BoredMplex", () => {
  const sleep = (amount: number) => new Promise((resolve) => setTimeout(resolve, amount));

  describe("onStream", () => {
    it ("calls onStream on open", async () => {
      let streamOpened = false;
      const mplex = new BoredMplex(() => {
        streamOpened = true;
      });

      mplex.write(pack({
        id: "foo",
        type: "open"
      }));

      await sleep(10);

      expect(streamOpened).toBeTruthy();
    });

    it ("does not call onStream without open", async () => {
      let streamOpened = false;
      const mplex = new BoredMplex(() => {
        streamOpened = true;
      });

      mplex.write(pack({
        id: "foo",
        type: "data"
      }));

      await sleep(10);

      expect(streamOpened).toBeFalsy();
    });
  });

  describe("stream", () => {
    it ("passes data to stream", async () => {
      const streamData: string[] = [];
      const mplex = new BoredMplex((stream) => {
        stream.on("data", (chunk: Buffer) => {
          streamData.push(chunk.toString());
        });
      });

      mplex.write(pack({
        id: "foo",
        type: "open"
      }));
      ["hello", "world"].forEach((msg) => {
        mplex.write(pack({
          id: "foo",
          type: "data",
          data: Buffer.from(msg)
        }));
      });

      await sleep(10);

      expect(streamData).toEqual(["hello", "world"]);
    });

    it ("passes data from stream", async () => {
      const passthrough = new PassThrough();
      const streamData: string[] = [];
      const mplex = new BoredMplex((stream) => {
        stream.on("data", (chunk: Buffer) => {
          stream.write(`hello ${chunk.toString()}`);
        });
      });

      passthrough.on("data", (chunk: Buffer) => {
        const msg = unpack(chunk) as StreamMessage;

        if (msg.data) streamData.push(msg.data.toString());
      });

      mplex.pipe(passthrough);
      mplex.write(pack({
        id: "foo",
        type: "open"
      }));
      ["world", "bored"].forEach((msg) => {
        mplex.write(pack({
          id: "foo",
          type: "data",
          data: Buffer.from(msg)
        }));
      });

      await sleep(20);

      mplex.end();

      expect(streamData).toEqual(["hello world", "hello bored"]);
    });
  });

  describe("onStream", () => {
    it("emits stream end from close message", (done) => {
      const mplex = new BoredMplex((stream) => {
        stream.on("finish", () => {
          done();
        });
      });

      mplex.write(pack({
        id: "foo",
        type: "open"
      }));

      mplex.write(pack({
        id: "foo",
        type: "close"
      }));
    });
  });
});
