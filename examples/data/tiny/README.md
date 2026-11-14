# Tiny test grid

8 columns by 6 rows, 20 m cells. Height rises 2 m per column going east, flat going north to south.

- `dem.bin`: row r, column c holds `2.0 * c` metres. First value 0, last value 14.
- `slope.bin`: every cell is 5.7106 degrees (a 2 m rise over 20 m).
- Both files are 192 bytes: 48 Float32 values, little-endian, north row first.

Use it to test loaders and the round trip in the pipeline's package step.
