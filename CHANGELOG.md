# windpipe

## 0.12.0

### Minor Changes

- 9ef31c7: allow different error types when existing stream has `never` error
- 5d20101: create `single` consumption method

### Patch Changes

- 180b70d: fix: export for WindpipeConsumptionError
- eb8bdae: re-arrange exports in package.json

## 0.11.1

### Patch Changes

- 39221db: Fix json serialisation issue when stream contains undefined values

## 0.11.0

### Minor Changes

- 035cf6a: add `fromPusher` stream creation method

## 0.10.0

### Minor Changes

- 7c566d2: create `onFirst` and `onLast` operators

## 0.9.10

### Patch Changes

- de16dab: fix batching with timeout and yield-remaining

## 0.9.9

### Patch Changes

- 8d3b6be: fix: inconsistency with batch yielding

## 0.9.8

### Patch Changes

- 2c8238d: fix: buffered map continuing on stream end

## 0.9.7

### Patch Changes

- 70fe273: feat: reject error atom option for `toArray`

## 0.9.6

### Patch Changes

- 7300858: rename `unknown` to `exception`, and deprecate all calls to `unknown`

## 0.9.5

### Patch Changes

- a87c801: fix: incorrect splicing when generating batch

## 0.9.4

### Patch Changes

- 2370529: feat: allow batching by bucket

## 0.9.3

### Patch Changes

- d9dcc4e: fix: add timeout with `n` option for buffer

## 0.9.2

### Patch Changes

- b293d9c: `batch` operator
- 784adb4: fix: continue emitting stream items after encountering non-raw item on raw stream
- 87515b3: fix: emit known and unknown errors onto node stream

## 0.9.1

### Patch Changes

- e050124: create `bufferedMap` operator

## 0.9.0

### Minor Changes

- 8db09c4: Implement `.toReadable()` method for streams

### Patch Changes

- b8a8ed7: Fix creating streams from arrays with nullish values

## 0.8.2

### Patch Changes

- 01dff15: clone array in `fromArray` to prevent mutating original array

## 0.8.1

### Patch Changes

- 52f03a1: fix broken types

## 0.8.0

### Minor Changes

- ad86792: Add .collect() method to streams
- 3ce4ff3: Implement `fromCallback` for stream creation
- 909d5a1: Adds the `cachedFlatMap` operator

### Patch Changes

- af01d2f: catch unhandled errors in `fromNext` stream creation
- 022efea: Improve exported API and generated docs

## 0.7.0

### Minor Changes

- 10e211e: Implement .flatten() method on streams

## 0.6.0

### Minor Changes

- 31a0db7: alter `flat*` APIs to simplify handlers
- ce64206: fix export for CJS

### Patch Changes

- e9ea819: add `exhaust` stream consumer

## 0.5.1

### Patch Changes

- 56147df: fix incorrect stream type for `flatTap`

## 0.5.0

### Minor Changes

- 27191f4: fix default exports for cjs

## 0.4.0

### Minor Changes

- e55d490: create new `ofError` and `ofUnknown` static methods for creating a stream
- e55d490: alter exported API
- 341ef76: add `flatTap`

## 0.3.1

### Patch Changes

- edd7aad: add Atom types to export

## 0.3.0

### Minor Changes

- 0aebf68: add `$.ok`, `$.error`, and `$.unknown` methods, to simplify creation of single atom streams.

  restrict items exported from `./atom.ts`, as not everything was required for the public API.

## 0.2.0

### Minor Changes

- 22723f5: add `drop` stream transform
