import { Transform, TransformCallback, TransformOptions } from "stream";
import { decodeAsync } from "@msgpack/msgpack";
import { Readable } from "stream";
import { Stream } from "./stream";
import { StreamMessage } from "./types";

export class BoredMplex extends Transform {
  public streams: Map<string, Stream> = new Map();

  constructor(private onStream?: (stream: Stream) => void, opts?: TransformOptions) {
    super(opts);
  }

  _transform(chunk: Buffer, encoding: BufferEncoding, callback: TransformCallback): void {
    decodeAsync(Readable.from(chunk)).then((value) => {
      const msg = value as StreamMessage;
      let stream = this.streams.get(msg.id);

      if (!stream) {
        if (msg.type !== "open") {
          return callback();
        }

        stream = new Stream(msg.id, this);
        this.streams.set(msg.id, stream);
        this.onStream?.(stream);

        return callback();
      }

      if (msg.data) {
        stream.push(msg.data);
      }

      if (msg.type === "close") {
        stream.end();
        this.streams.delete(msg.id);
      }

      callback();
    });
  }
}
