/// <reference types="node" />
import { Duplex } from "stream";
import { BoredMplex } from "./bored-mplex";
declare type WriteCallback = (error?: Error | null) => void;
export declare class Stream extends Duplex {
    id: number;
    private session;
    private buffer?;
    constructor(id: number, session: BoredMplex);
    openStream(): void;
    _read(): void;
    _write(chunk: any, encoding: BufferEncoding, callback: WriteCallback): void;
    private pushWithBackpressure;
    private flushBuffer;
}
export {};
