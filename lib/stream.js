"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Stream = void 0;
const msgpackr_1 = require("msgpackr");
const stream_1 = require("stream");
class Stream extends stream_1.Duplex {
    constructor(id, session) {
        super({
            emitClose: true,
            writableHighWaterMark: 1024 * 1024 * 8,
            readableHighWaterMark: 1024 * 1024 * 8
        });
        this.id = id;
        this.session = session;
        this.on("sessionDrained", () => {
            this.flushBuffer();
        });
        this.on("finish", () => {
            if (session.writableEnded) {
                return;
            }
            session.push(msgpackr_1.pack({
                id,
                type: "close"
            }));
        });
    }
    openStream() {
        this.session.push(msgpackr_1.pack({
            id: this.id,
            type: "open"
        }));
    }
    _read() {
        //
    }
    _write(chunk, encoding, callback) {
        this.pushWithBackpressure(chunk, encoding, callback);
    }
    pushWithBackpressure(chunk, encoding, callback) {
        if (this.session.writableEnded) {
            return;
        }
        if (this.buffer !== undefined) {
            this.buffer.push({ chunk, encoding, callback });
            return;
        }
        const pushed = this.session.push(msgpackr_1.pack({
            id: this.id,
            type: "data",
            data: chunk
        }), encoding);
        if (!pushed) {
            this.buffer = [{ chunk, encoding, callback }];
            console.log("cannot push to session", this.id, this.buffer.length, this.session);
        }
        else {
            callback();
        }
    }
    flushBuffer() {
        if (!this.buffer) {
            this.buffer = undefined;
            return;
        }
        console.log("DRAIN STREAM", this.id, this.buffer.length);
        const buffer = this.buffer;
        this.buffer = undefined;
        for (const item of buffer) {
            this.pushWithBackpressure(item.chunk, item.encoding, item.callback);
        }
    }
}
exports.Stream = Stream;
