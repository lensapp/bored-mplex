import { BoredMplex } from "../bored-mplex";
import { pack, unpack } from "msgpackr";
import { PassThrough } from "stream";
import { StreamMessage } from "../types";

describe("BoredMplex", () => {
  const sleep = (amount: number) => new Promise((resolve) => setTimeout(resolve, amount));

  describe("onStream", () => {
    it ("calls onStream on open", (done) => {
      const mplex = new BoredMplex(() => {
        mplex.end();
        done();
      });

      mplex.write(pack({
        id: "foo",
        type: "open"
      }));
    });

    it ("passes data from open to onStream", (done) => {
      const mplex = new BoredMplex((stream, data) => {
        expect(data?.toString()).toEqual("this-is-data");
        mplex.end();
        done();
      });

      mplex.write(pack({
        id: "foo",
        type: "open",
        data: Buffer.from("this-is-data")
      }));
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
      mplex.end();
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
      mplex.end();
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
          mplex.end();
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

  describe("keepalive", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("responds to ping with pong", (done) => {
      const stream = new PassThrough();
      const mplex = new BoredMplex();

      stream.on("data", (chunk: Buffer) => {
        const msg = unpack(chunk);

        if (msg.type === "pong") {
          mplex.end();
          done();
        }
      });

      mplex.pipe(stream);
      mplex.write(pack({
        id: 0,
        type: "ping"
      }));
    });

    it("emits pong event on pong message", (done) => {
      const mplex = new BoredMplex();

      mplex.on("pong", () => {
        mplex.end();
        done();
      });
      mplex.write(pack({
        id: 0,
        type: "pong"
      }));
    });

    it("emits timeout event if pong takes too long", (done) => {
      const mplex = new BoredMplex();

      mplex.enableKeepAlive(1000);
      mplex.on("timeout", () => {
        mplex.end();
        done();
      });
      jest.advanceTimersByTime(5000);
    });

    it("emits timeout event if stream has been closed before ping", (done) => {
      const passthrough = new PassThrough();
      const mplex = new BoredMplex();

      mplex.enableKeepAlive(1000);
      mplex.pipe(passthrough);
      passthrough.on("error", (err) => err);
      passthrough.end();
      mplex.on("timeout", () => {
        mplex.end();
        done();
      });
      jest.advanceTimersByTime(5000);
    });
  });
});
