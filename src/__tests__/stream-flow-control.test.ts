import { BoredMplex } from "../bored-mplex";
import { BoredMplexClient } from "../bored-mplex-client";
import { Stream, STREAM_WINDOW } from "../stream";
import { unpack } from "msgpackr";
import { PassThrough } from "stream";
import { once } from "events";
import { StreamMessage } from "../types";

describe("stream flow control", () => {
  const payload = Buffer.alloc(4 * STREAM_WINDOW);
  let client: BoredMplexClient;
  let server: BoredMplex;
  let serverStreams: Stream[];

  payload.forEach((_, i) => payload[i] = i % 251);

  const ticks = async (count: number) => {
    for (let i = 0; i < count; i++) await new Promise((resolve) => setImmediate(resolve));
  };

  const until = async (condition: () => boolean, what: string) => {
    for (let i = 0; i < 10_000; i++) {
      if (condition()) return;
      await ticks(1);
    }
    throw new Error(`gave up waiting for ${what}`);
  };

  const openedOnServer = async (stream: Stream) => {
    stream.write("x");
    await until(() => serverStreams.length > 0, "the stream to open on the server");

    return serverStreams.shift() as Stream;
  };

  const readAll = async (stream: Stream, length: number) => {
    const chunks: Buffer[] = [];
    let total = 0;

    stream.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
      total += chunk.byteLength;
    });
    stream.resume();
    await until(() => total >= length, `${length} bytes`);

    return Buffer.concat(chunks);
  };

  beforeEach(() => {
    serverStreams = [];
    client = new BoredMplexClient();
    server = new BoredMplex((stream) => {
      stream.pause();
      serverStreams.push(stream);
    });
    client.pipe(server);
    server.pipe(client);
  });

  afterEach(() => {
    client.end();
    server.end();
  });

  it("tells the peer that it counts a window", async () => {
    await ticks(2);

    expect(client.peerHasWindow).toBe(true);
    expect(server.peerHasWindow).toBe(true);
  });

  it("sends no more than one window to a reader that does not read", async () => {
    const stream = client.openStream();
    const remote = await openedOnServer(stream);

    stream.write(payload);
    await ticks(20);

    expect(remote.readableLength).toBeLessThanOrEqual(STREAM_WINDOW);
    expect(stream.writableLength).toBeGreaterThan(0);
  });

  it("sends the rest in order when the reader reads", async () => {
    const stream = client.openStream();
    const remote = await openedOnServer(stream);

    stream.write(payload);
    await ticks(20);

    expect(await readAll(remote, 1 + payload.length)).toEqual(Buffer.concat([Buffer.from("x"), payload]));
  });

  it("keeps other streams going when one stream has no credit", async () => {
    const blocked = client.openStream();

    await openedOnServer(blocked);
    blocked.write(payload);
    await ticks(20);

    const other = client.openStream();
    const remote = await openedOnServer(other);

    other.write(payload);

    expect(await readAll(remote, 1 + payload.length)).toHaveLength(1 + payload.length);
  });

  it("sends the whole reply when the peer ends its side while the reply waits for credit", async () => {
    const stream = client.openStream();
    const remote = await openedOnServer(stream);

    remote.write(payload);
    await until(() => remote.writableLength > 0 && server.queue.length === 0, "the reply to wait for credit");
    stream.end();
    await until(() => remote.writableEnded, "the server side to end");

    expect(await readAll(stream, payload.length)).toEqual(payload);
  });

  it("releases the writes that wait for credit when the session ends", async () => {
    const stream = client.openStream();

    await openedOnServer(stream);
    stream.write(payload);
    stream.write(payload);
    stream.end();
    await ticks(20);
    client.end();

    await once(stream, "finish");
  });

  it("sends without a window to a peer that does not count one", async () => {
    const oldPeer = new BoredMplexClient();
    const wire = new PassThrough();
    const sent: StreamMessage[] = [];
    const stream = oldPeer.openStream();

    wire.on("data", (chunk: Buffer) => sent.push(unpack(chunk)));
    oldPeer.pipe(wire);
    stream.write(payload);
    await ticks(20);

    const bytes = sent
      .filter((msg) => msg.type === "data")
      .reduce((total, msg) => total + (msg.data as Buffer).byteLength, 0);

    expect(bytes).toEqual(payload.length);
    oldPeer.end();
  });
});
