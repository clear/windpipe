import { Stream } from "./stream";

// Export all useful types for atoms
export type {
    Atom,
    AtomOk,
    AtomError,
    AtomUnknown,
    VALUE,
    ERROR,
    UNKNOWN,
    MaybeAtom,
} from "./atom";

// Re-export useful utility types
export type { MaybePromise, Truthy, CallbackOrStream } from "./util";

// Export the `StreamEnd` type
export { StreamEnd } from "./stream";

export default Stream;
