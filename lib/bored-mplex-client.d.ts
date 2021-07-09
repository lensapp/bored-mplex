import { BoredMplex } from "./bored-mplex";
import { Stream } from "./stream";
export declare class BoredMplexClient extends BoredMplex {
    private nextStreamID;
    constructor();
    openStream(): Stream;
}
