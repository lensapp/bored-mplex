import { BoredMplex } from "../bored-mplex";
import { BoredMplexClient } from "../bored-mplex-client";
import { Stream } from "../stream";
import { unpack } from "msgpackr";
import { PassThrough, Transform } from "stream";
import { once } from "events";
import { StreamMessage } from "../types";

describe("stream close", () => {
  let client: BoredMplexClient;
  let server: BoredMplex;
  let serverStreams: Stream[];
  let wire: StreamMessage[];

  beforeEach(() => {
    serverStreams = [];
    wire = [];
    client = new BoredMplexClient();
    server = new BoredMplex((stream) => serverStreams.push(stream));

    const tap = new PassThrough();

    tap.on("data", (chunk: Buffer) => wire.push(unpack(chunk)));
    client.pipe(tap).pipe(server);
    server.pipe(client);
  });

  afterEach(() => {
    client.end();
    server.end();
  });

  const openedOnServer = async (stream: Stream) => {
    stream.write("hello");
    while (serverStreams.length === 0) await new Promise((resolve) => setImmediate(resolve));

    return serverStreams[0];
  };

  const ended = (stream: Stream) => {
    stream.resume();

    return once(stream, "end");
  };

  it("ends the peer's reader when a stream ends", async () => {
    const stream = client.openStream();
    const remote = await openedOnServer(stream);

    stream.end();

    await ended(remote);
  });

  it("lets the peer send after a stream ends", async () => {
    const stream = client.openStream();
    const remote = await openedOnServer(stream);
    const reply: Buffer[] = [];

    stream.on("data", (chunk: Buffer) => reply.push(chunk));
    stream.end();
    await ended(remote);
    remote.end("reply");

    await ended(stream);
    expect(Buffer.concat(reply).toString()).toEqual("reply");
  });

  it("forgets the stream on both sides once both sides ended", async () => {
    const stream = client.openStream();
    const remote = await openedOnServer(stream);

    stream.end();
    await ended(remote);
    remote.end();
    await ended(stream);

    expect(client.streams.size).toEqual(0);
    expect(server.streams.size).toEqual(0);
  });

  it("forgets the stream on both sides when a stream that ended is destroyed", async () => {
    const stream = client.openStream();
    const remote = await openedOnServer(stream);

    stream.end();
    await ended(remote);
    stream.destroy();
    await once(remote, "finish");

    expect(client.streams.size).toEqual(0);
    expect(server.streams.size).toEqual(0);
  });

  describe("before the peer's hello arrives", () => {
    let slowClient: BoredMplexClient;
    let slowServer: BoredMplex;
    let slowRemotes: Stream[];

    const delayed = () => new Transform({
      transform(chunk, _encoding, callback) {
        setTimeout(() => callback(null, chunk), 5);
      }
    });

    beforeEach(() => {
      slowRemotes = [];
      slowClient = new BoredMplexClient();
      slowServer = new BoredMplex((remote) => {
        remote.resume();
        slowRemotes.push(remote);
      });
      slowClient.pipe(delayed()).pipe(slowServer);
      slowServer.pipe(delayed()).pipe(slowClient);
    });

    afterEach(() => {
      slowClient.end();
      slowServer.end();
    });

    it("lets the peer reply when a stream ends", async () => {
      const stream = slowClient.openStream();
      const reply: Buffer[] = [];

      stream.on("data", (chunk: Buffer) => reply.push(chunk));
      stream.end("request");
      while (slowRemotes.length === 0) await new Promise((resolve) => setImmediate(resolve));
      slowRemotes[0].on("end", () => slowRemotes[0].end("reply"));
      await ended(stream);

      expect(Buffer.concat(reply).toString()).toEqual("reply");
      expect(slowClient.streams.size).toEqual(0);
      expect(slowServer.streams.size).toEqual(0);
    });

    it("closes the peer when a stream that ended is destroyed", async () => {
      const stream = slowClient.openStream();

      stream.end("request");
      while (slowRemotes.length === 0) await new Promise((resolve) => setImmediate(resolve));
      stream.destroy();
      await once(slowRemotes[0], "close");

      expect(slowClient.streams.size).toEqual(0);
      expect(slowServer.streams.size).toEqual(0);
    });
  });

  it("forgets a stream that sent close before the peer said that it has half-close, once the peer ends", async () => {
    const stream = client.openStream();
    const remote = await openedOnServer(stream);

    server.unpipe(client);
    remote.end();
    await once(remote, "finish");
    client.peerHasEnd = false;
    stream.end();
    await once(stream, "finish");
    server.pipe(client);
    await ended(stream);

    expect(client.streams.size).toEqual(0);
  });

  it("ends both sides when a stream ends on a peer without half-close", async () => {
    const stream = client.openStream();

    await openedOnServer(stream);
    client.peerHasEnd = false;
    server.peerHasEnd = false;
    stream.end();

    await ended(stream);
  });

  it("ends the peer's reader when a stream is destroyed", async () => {
    const stream = client.openStream();
    const remote = await openedOnServer(stream);

    stream.destroy();

    await ended(remote);
  });

  it("sends one end and no close for a stream that ends", async () => {
    const stream = client.openStream();
    const remote = await openedOnServer(stream);

    stream.end();
    await ended(remote);
    remote.end();
    await ended(stream);
    await new Promise((resolve) => setImmediate(resolve));

    expect(wire.filter((msg) => msg.type === "end")).toHaveLength(1);
    expect(wire.filter((msg) => msg.type === "close")).toHaveLength(0);
  });

  it("ends every reader when the session ends", async () => {
    const stream = client.openStream();

    await openedOnServer(stream);
    client.end();

    await ended(stream);
  });
});
