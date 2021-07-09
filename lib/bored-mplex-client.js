"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BoredMplexClient = void 0;
const bored_mplex_1 = require("./bored-mplex");
const stream_1 = require("./stream");
class BoredMplexClient extends bored_mplex_1.BoredMplex {
    constructor() {
        super();
        this.nextStreamID = 1;
    }
    openStream() {
        const stream = new stream_1.Stream(this.nextStreamID++, this);
        this.streams.set(stream.id, stream);
        stream.openStream();
        return stream;
    }
}
exports.BoredMplexClient = BoredMplexClient;
