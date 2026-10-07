import { BoredMplex } from "../bored-mplex";
import { BoredMplexClient } from "../bored-mplex-client";
import { Stream } from "../stream";
import { unpack } from "msgpackr";
import { PassThrough } from "stream";
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

  it("ends the reader of the stream that ended once the peer closes too", async () => {
    const stream = client.openStream();

    await openedOnServer(stream);
    stream.end();

    await ended(stream);
  });

  it("ends the peer's reader when a stream is destroyed", async () => {
    const stream = client.openStream();
    const remote = await openedOnServer(stream);

    stream.destroy();

    await ended(remote);
  });

  it("sends one close per stream", async () => {
    const stream = client.openStream();
    const remote = await openedOnServer(stream);

    stream.end();
    await ended(remote);
    await ended(stream);
    await new Promise((resolve) => setImmediate(resolve));

    expect(wire.filter((msg) => msg.type === "close")).toHaveLength(1);
  });

  it("ends every reader when the session ends", async () => {
    const stream = client.openStream();

    await openedOnServer(stream);
    client.end();

    await ended(stream);
  });
});
