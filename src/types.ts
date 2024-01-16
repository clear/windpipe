/**
 * Callback function consuming value of type `T`.
 */
export type Callback<T> = (value: T) => void;

/**
 * Callback function consuming optional value of type `T`.
 */
export type OptionalCallback<T> = (value?: T) => void;

