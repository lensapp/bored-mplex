import { BoredMplex } from "../bored-mplex";
import { BoredMplexClient } from "../bored-mplex-client";
import { Stream } from "../stream";
import { once } from "events";

describe("stream backpressure", () => {
  const chunk = Buffer.alloc(64 * 1024, 1);
  const chunks = 32;

  const ticks = async (count: number) => {
    for (let i = 0; i < count; i++) await new Promise((resolve) => setImmediate(resolve));
  };

  const writeAll = (stream: Stream) => {
    for (let i = 0; i < chunks; i++) stream.write(chunk);
  };

  it("holds a stream's writes while the session is not read", async () => {
    const client = new BoredMplexClient();
    const stream = client.openStream();

    writeAll(stream);
    await ticks(10);

    expect(client.queue.length).toBeLessThanOrEqual(1);
    expect(stream.writableLength).toBeGreaterThan(chunk.length * (chunks - 4));

    client.end();
  });

  it("delivers every held write once the session is read", async () => {
    const client = new BoredMplexClient();
    const received: Buffer[] = [];
    const server = new BoredMplex((remote) => remote.on("data", (data: Buffer) => received.push(data)));
    const stream = client.openStream();

    writeAll(stream);
    await ticks(10);
    client.pipe(server);
    while (Buffer.concat(received).length < chunk.length * chunks) await ticks(1);

    expect(Buffer.concat(received)).toEqual(Buffer.concat(Array(chunks).fill(chunk)));

    client.end();
    server.end();
  });

  it("releases held writes when the session ends", async () => {
    const client = new BoredMplexClient();
    const stream = client.openStream();

    writeAll(stream);
    await ticks(10);
    client.end();

    await once(stream, "finish");
  });

  it("releases held writes when the session is destroyed", async () => {
    const client = new BoredMplexClient();
    const stream = client.openStream();

    writeAll(stream);
    await ticks(10);
    client.on("error", () => undefined);
    client.destroy(new Error("gone"));

    await once(stream, "finish");
  });
});
