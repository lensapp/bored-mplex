/// <reference types="node" />
import { Transform, TransformCallback, TransformOptions } from "stream";
import { Stream } from "./stream";
export declare class BoredMplex extends Transform {
    private onStream?;
    streams: Map<number, Stream>;
    private pingInterval?;
    private pingTimeout?;
    private streamBufferings;
    constructor(onStream?: ((stream: Stream) => void) | undefined, opts?: TransformOptions);
    enableKeepAlive(interval?: number): void;
    disableKeepAlive(): void;
    ping(): void;
    pong(): void;
    _transform(chunk: Buffer, encoding: BufferEncoding, callback: TransformCallback): void;
    private pushWithBackpressure;
    protected createStream(id: number): Stream;
}
