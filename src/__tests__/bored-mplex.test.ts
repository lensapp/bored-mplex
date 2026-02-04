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
      mplex.once("timeout", () => {
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
      mplex.once("timeout", () => {
        mplex.end();
        done();
      });
      jest.advanceTimersByTime(5000);
    });
  });

  describe("stream idle timeout", () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date("2024-01-01T00:00:00.000Z"));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("cleans up idle streams after timeout", () => {
      const mplex = new BoredMplex(undefined, { streamIdleTimeout: 5000 });

      mplex.write(pack({ id: 1, type: "open" }));

      expect(mplex.streams.size).toBe(1);

      // Interval runs at 2500ms (half of 5000). Need to wait for check after 5000ms.
      jest.advanceTimersByTime(7500);

      expect(mplex.streams.size).toBe(0);
      mplex.end();
    });

    it("does not clean up active streams", () => {
      const mplex = new BoredMplex(undefined, { streamIdleTimeout: 5000 });

      mplex.write(pack({ id: 1, type: "open" }));

      // Advance 3 seconds, stream should still exist
      jest.advanceTimersByTime(3000);
      expect(mplex.streams.size).toBe(1);

      // Send data to reset activity timestamp
      mplex.write(pack({ id: 1, type: "data", data: Buffer.from("activity") }));

      // Advance another 3 seconds (6 total since open, but only 3 since activity)
      jest.advanceTimersByTime(3000);
      expect(mplex.streams.size).toBe(1);

      // Advance 7.5 more seconds - now >5 seconds since last activity, check runs
      jest.advanceTimersByTime(7500);

      expect(mplex.streams.size).toBe(0);
      mplex.end();
    });

    it("is disabled by default", async () => {
      jest.useRealTimers();
      const mplex = new BoredMplex();

      mplex.write(pack({ id: 1, type: "open" }));

      await sleep(10);

      expect(mplex.streams.size).toBe(1);
      mplex.end();
    });
  });
});
