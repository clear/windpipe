<p align="center">
    <img width="150" height="150" src="media/logo.png" alt="Logo" />
</p>

<p align="center">
    <strong>TypeScript streams influenced by Rust, an experimental successor to Highland.</strong>
</p>

# Features

- Strict typing of stream values

- Built-in error handling for stream operaitons

- Many common stream operations (`map`, `tap`, `flatMap`, etc.)

- Interopability with other async primitives:

  - Promises

  - Iterators (async and standard)

  - Node streams

  - Generators

- Stream-relative stack traces (nested anonymous functions in stack traces no more!)

# Examples

## Simple

```ts
import $ from "windpipe";

const values = await $.of(10) // Create a stream with a single value
    .map((value) => value * 2) // Double each value in the stream
    .tap((value) => console.log(`The doubled value is: ${value}`)) // Perform some side effect on each value
    .flatMap((value) => $.from([value, -1 * value])) // Use each value to produce multiple new values
    .toArray(); // Consume the stream into a promise that will emit an array

console.log(values); // [20, -20]
```

## Error Handling

```ts
import $ from "windpipe";

const s = $.from([1, 2, 5, 0])
    .map((value) => {
        if (value === 0) {
            // Invalid value, produce an error
            return err({ msg: "can't divide by zero"});
        }

        return 10 / value;
    })
    .mapError((err) => $.error({
        // We have to shout at the user, change the error message
        loudMsg: err.msg.toUpperCase()
    }));


// Iterate through each 'atom' on the stream
for await (const atom in s) {
    if ($.isOk(atom)) {
        // Successful value!
        console.log(atom.value);
    } else if ($.isError(atom)) {
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

# Concepts

## Atoms

Every item in a stream is an [`Atom<T, E>`](https://clear.github.io/windpipe/types/Atom.html), and
an `Atom<T, E>` has one of three variations:

- [`AtomOk<T>`](https://clear.github.io/windpipe/types/AtomOk.html): These are generally the things
that you are processing and would care about on the stream.

- [`AtomError<E>`](https://clear.github.io/windpipe/types/AtomError.html): These are application
errors which are expected to occur. In other words, they are errors that occur in the problem
domain you are working in.

- [`AtomUnknown`](https://clear.github.io/windpipe/types/AtomUnknown.html): These are encompass
any runtime error that may be raised from your code.

For example, if you were making a program to process account transactions, the atom variations
could include:

- `AtomOk`: `Transaction { id: number, amount: number, description: string }`

- `AtomError`: `TransactionError { type: "low-balance" | "empty-description" | "duplicate-id" }`

- `AtomUnknown`: `TypeError`, `ReferenceError`, other uncaught errors

In application code, this would be typed as `Atom<Transaction, TransactionError>`.  This is
because both `Transaction` and `TransactionError` are relevant to the domain, and therefore will
appear in type signatures. On the other hand, the type of 'uncaught' errors that maybe thrown are
not typed in JavaScript or TypeScript, so there is no guarantee if they may occur, and what they
may be, which is why `AtomUnknown` does not appear within the type.

### `AtomError` vs `AtomUnknown`

In general, there are two types of errors that you will encounter: errors you care about, and
errors you don't. More concretely, these are errors that you will plan and check for, and errors
that aren't practical to exhaustively check (you can't wrap every line in a `try`/`catch`).
Normally there is no way for these two error types to be distinguished, and it is up to the
developer to decide what they care about handling, and to remember to do so.

Windpipe assists the developer by seperating the errors, embedding the errors you care about in
the type system (indicated by the `E` generic), collecting all other errors into the 'unknown'
atom.

### Returning Atoms

Windpipe does its best to guess your intended atom type where possible, using the following rules:

- If a handler returns an `Atom<T, E>`, it will be used.

```js
return $.ok({ balance: 10 });
```

- If a handler throws an error, it will be `AtomUnknown`.

```js
throw new Error("something happened");
```

- Any other value returned from an error will be `AtomOk<T>`.

```js
return { balance: 10 };
```

If you would like a specific atom type to be used, the following shorthands can be used:

- `AtomOk<T>`: `$.ok(value)`

- `AtomError<E>`: `$.error(value)`

- `AtomUnknown`: `$.unknown(value, trace)`

  - This shorthand should rarely be used, as unknown errors really shouldn't be manually created.
  Windpipe tracks the location that the error was emitted, which is what the `trace` parameter
  represents. If you are unsure what to include here, an empty array is acceptable, but not
  recommended.

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

