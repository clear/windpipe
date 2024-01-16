import type { Callback } from "./types";

/**
 * Helper function to both return a promise and support a callback.
 */
export function wrap_async<T>(done: Callback<T> | undefined, handler: Callback<Callback<T>>): Promise<T> {
    // Return the promise
    return new Promise((resolve) => {
        // Call the handler, providing it a callback for when it's complete
        handler((value) => {
            // When it's complete, resolve the promise
            resolve(value);

            // If there's a callback provided via a param, call it too
            if (done) {
                done(value);
            }
        });
    });
}
