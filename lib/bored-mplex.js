"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BoredMplex = void 0;
const stream_1 = require("stream");
const msgpackr_1 = require("msgpackr");
const stream_2 = require("./stream");
class BoredMplex extends stream_1.Transform {
    constructor(onStream, opts) {
        super({
            writableHighWaterMark: 1024 * 1024 * 8,
            readableHighWaterMark: 1024 * 1024 * 8,
            ...opts
        });
        this.onStream = onStream;
        this.streams = new Map();
        this.streamBufferings = new Map();
        this.on("error", () => {
            this.streams.forEach((stream) => stream.end());
        });
        this.on("finish", () => {
            this.streams.forEach((stream) => stream.end());
        });
        this.on("drain", () => {
            for (const stream of this.streams.values()) {
                stream.emit("sessionDrained");
            }
        });
    }
    enableKeepAlive(interval = 10000) {
        this.pingInterval = setInterval(() => {
            this.pingTimeout = setTimeout(() => {
                if (this.pingInterval)
                    clearInterval(this.pingInterval);
                this.emit("timeout");
                this.end();
            }, 2000);
            this.ping();
            this.once("pong", () => {
                if (this.pingTimeout)
                    clearTimeout(this.pingTimeout);
            });
        }, interval);
    }
    disableKeepAlive() {
        if (this.pingInterval)
            clearInterval(this.pingInterval);
        if (this.pingTimeout)
            clearTimeout(this.pingTimeout);
    }
    ping() {
        if (this.writableEnded) {
            return;
        }
        this.push(msgpackr_1.pack({
            id: 0,
            type: "ping"
        }));
    }
    pong() {
        if (this.writableEnded) {
            return;
        }
        this.push(msgpackr_1.pack({
            id: 0,
            type: "pong"
        }));
    }
    _transform(chunk, encoding, callback) {
        const msg = msgpackr_1.unpack(chunk);
        let stream = this.streams.get(msg.id);
        switch (msg.type) {
            case "ping": {
                this.emit("ping");
                this.pong();
                return callback();
            }
            case "pong": {
                this.emit("pong");
                return callback();
            }
        }
        if (!stream && msg.type === "open") {
            stream = this.createStream(msg.id);
            return callback();
        }
        if (!stream) {
            return callback();
        }
        switch (msg.type) {
            case "data": {
                if (msg.data) {
                    this.pushWithBackpressure(stream, msg.data, encoding, callback);
                }
                else {
                    callback();
                }
                break;
            }
            case "close": {
                stream.end();
                this.streams.delete(msg.id);
                callback();
                break;
            }
            default: {
                callback();
            }
        }
    }
    pushWithBackpressure(stream, chunk, encoding, callback) {
        if (stream.writableEnded) {
            callback();
            return;
        }
        if (this.streamBufferings.has(stream.id)) {
            const buffer = this.streamBufferings.get(stream.id);
            buffer === null || buffer === void 0 ? void 0 : buffer.push({ id: stream.id, chunk, encoding, callback });
            return;
        }
        const pushed = stream.push(chunk, encoding);
        if (!pushed) {
            const buffer = this.streamBufferings.get(stream.id);
            if (!buffer) {
                callback();
                return;
            }
            buffer.push({ id: stream.id, chunk, encoding, callback });
            this.streamBufferings.set(stream.id, buffer);
        }
        else {
            callback();
        }
    }
    createStream(id) {
        var _a;
        const stream = new stream_2.Stream(id, this);
        stream.on("drain", () => {
            const buffer = this.streamBufferings.get(id);
            if (!buffer) {
                return;
            }
            this.streamBufferings.delete(id);
            for (const item of buffer) {
                const stream = this.streams.get(item.id);
                if (!stream) {
                    item.callback();
                    continue;
                }
                this.pushWithBackpressure(stream, item.chunk, item.encoding, item.callback);
            }
        });
        stream.on("finish", () => {
            this.streamBufferings.delete(id);
        });
        this.streams.set(id, stream);
        (_a = this.onStream) === null || _a === void 0 ? void 0 : _a.call(this, stream);
        return stream;
    }
}
exports.BoredMplex = BoredMplex;
