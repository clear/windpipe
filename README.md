<p align="center">
    <img width="150" height="150" src="/logo.png" alt="Logo" />
</p>

<p align="center">
    <strong>TypeScript streams influenced by Rust, an experimental successor to Highland.</strong>
</p>

# Features

- Strict typing of stream values

- Built-in error handling for stream operaitons

- Many common stream operations (`map`, `tap`, `flat_map`, etc.)

- Interopability with other async primitives:

  - Promises

  - Iterators (async and standard)

  - Node streams (WIP)

- Stream kind (single emitter, multi-emitter, fallible, etc) in type system (WIP)

- Control flow operators (`if` and `case`, WIP)

- Stream-relative stack traces (nested anonymous functions in stack traces no more!)

# Examples

## Simple

```ts
const values = await Stream.of(10) // Create a stream with a single value
    .map((value) => value * 2) // Double each value in the stream
    .tap((value) => console.log(`The doubled value is: ${value}`)) // Perform some side effect on each value
    .flat_map((value) => [value, -1 * value]) // Use each value to produce multiple new values
    .toArray(); // Consume the stream into a promise that will emit an array

console.log(values); // [20, -20]
```

## Error Handling

```ts
const s = Stream.from([1, 2, 5, 0])
    .map((value) => {
        if (value === 0) {
            // Invalid value, produce an error
            return err({ msg: "can't divide by zero"});
        }

        return 10 / value;
    })
    .map_err((err) => ({
        // We have to shout at the user, change the error message
        loud_msg: err.msg.toUpperCase()
    }));


while (true) {
    const next = await s.next();

    if (is_end(next)) {
        // End of the stream reached!
        break;
    } else if (is_ok(next)) {
        // Successful value!
        console.log(next.value);
    } else if (is_err(next)) {
        // An error was encountered
        console.error("encountered an error:", next.value);
    }
}

/* Outputs:
  (log)   10
  (log)   5
  (log)   2
  (error) { loud_msg: "encountered an error: CAN'T DIVIDE BY ZERO" }
*/
```

## Control Flow

In an effort to make common patterns like applying `if` statements in a `flat_map`, some basic
control flow operations are available directly on the stream!

```ts
// Using stream control flow:
Stream.from([83, 18398, 915, 618])
    .if((value) => value > 750, (value) => process_large_transaction(value))
    .else_if((value) => value < 100, (value) => process_small_transaction(value))
    .else((value) => process_transaction(value))

// Using regular `flat_map` with native control flow
Stream.from([83, 18398, 915, 618])
    .flat_map((value) => {
        if (value > 750) {
            return process_large_transaction(value);
        } else if (value < 100) {
            return process_small_transaction(value);
        } else {
            return process_transaction(value);
        }
    });
```

# Error Handling

Error handling is a crucial component to every application, however languages like JavaScript and
TypeScript make it exceptionally easy to omit error handling, producing unrelaiable applications,
and increasing debugging time due to there being no documentation within the source of where an
error may be produced.

Windpipe attempts to solve this by including errors as part of the core stream type:
`Stream<T, E>`, where `T` is the type of the 'success' value of the stream, and `E` is the type of
the 'application error'. For example, if a stream was being used as part of a financial system for
processing transactions then `T` could be `number` (representing the current value of the
transaction) and `E` could be an instance of `TransactionError` which could include fields like
`error_no` and `message`. As stream operations are applied to the value in the stream, each step
may emit `T` onwards (indicating that all is well, the stream can continue), or `E` to immediately
terminate that value in the stream and produce an error. Including the type of the error in the
stream makes it obvious to the consumer that a) an error may be produced, and b) the shape of the
error so that there aren't any runtime gymnastics to work out what this error value actually is.

Windpipe also includes a third variant that isn't encoded in the type, aptly called `unknown`. This
is meant to handle the many possible unhandled errors that may be thrown within an application that
the developer mightn't have explicitly handled. This attempts to address the prevalent issue with
JavaScript where it's impossible to know what errors may be thrown.

The result of this is that the developer has a choice of three things to consume from each
advancement of the stream:

- `T`: The value we would expect to return from the stream

- `E`: Some application error that we have explicitly defined and will have types for

- `any`: An unknown error that was thrown somewhere, which we could try recover from by turning it
into a value or an application error

With an error type encoded in our type, we can do all the same fun things we can do with the
stream values, such as mapping errors into a different error type. For example, if a login page
uses a HTTP helper that produces `Stream<T, HttpError>`, `.map_err` can be used to convert
`HttpError` into a `LoginError`.

# Windpipe vs x

Windpipe is an attempt to plug a few holes left by other solutions.

## Windpipe vs [Highland](https://github.com/caolan/highland)

Highland is what originally spurred me to create Windpipe. Functionally, it's relatively similar
however its type support leaves a lot to be desired. The `@types/*` definitions for the package are
incomplete, out of date, or incorrect, and the library itself is unmaintained. Finally, Highland
has no support for typed application errors, it only emits as either a 'value' or an 'error'.

I am intending for Windpipe to be mostly compatible with Highland (particularly for the basic
operators), ideally with some kind of adapter to convert one stream type into another, for partial
adoption.

## Windpipe vs Native Promises

Compared to Windpipe, native promises have three main downfalls:

- Promises are eagerly executed, meaning that they will immediately try to resolve their value when
they are created, rather than when they are called.

- Promises may only emit a single value or a single error, emitting a mix or multiple of either is
not possible without other (cumbersome) APIs such as async iterators.

- Only the 'success' value of a promise is typed, the error value is completely untyped and may be
anything.

Windpipe should be able to completely support any use case that promises may be used for, in
addition with many features that promises can never support.

