// Millimeters are converted to CSS reference pixels using the standard
// browser convention: 96px = 1in, so 1mm = 96/25.4 px. This is an
// approximation (browsers don't know the display's true physical density),
// but it's the same convention every browser uses for CSS length units, so
// it stays consistent across devices and with any CSS "mm" values. World
// space (shape/camera coordinates) uses this same px unit throughout.
export const PX_PER_MM = 1;
