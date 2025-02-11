import { Stream } from "./stream";

// Export all useful types for atoms
export type {
    Atom,
    AtomOk,
    AtomError,
    AtomException,
    AtomUnknown,
    VALUE,
    ERROR,
    EXCEPTION,
    UNKNOWN,
    MaybeAtom,
} from "./atom";

// Re-export useful utility types
export type { MaybePromise, Truthy, CallbackOrStream, NodeCallback } from "./util";

export default Stream;
