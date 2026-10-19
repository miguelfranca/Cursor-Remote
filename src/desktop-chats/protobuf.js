const VARINT = 0;
const FIXED64 = 1;
const LENGTH_DELIMITED = 2;
const FIXED32 = 5;

export function varintField(field, number) {
  return Buffer.concat([varint((field << 3) | VARINT), varint(number)]);
}

export function bytesField(field, bytes) {
  const payload = Buffer.from(bytes);
  return Buffer.concat([varint((field << 3) | LENGTH_DELIMITED), varint(payload.length), payload]);
}

export function stringField(field, text) {
  return bytesField(field, Buffer.from(text, "utf8"));
}

export function readFields(bytes) {
  const buffer = Buffer.from(bytes);
  const fields = [];
  let offset = 0;

  function readVarint() {
    let number = 0n;
    let shift = 0n;
    while (true) {
      if (offset >= buffer.length) throw new Error("The message ends inside a number.");
      const byte = buffer[offset];
      offset += 1;
      number |= BigInt(byte & 0x7f) << shift;
      if (!(byte & 0x80)) return number;
      shift += 7n;
    }
  }

  function take(length) {
    if (offset + length > buffer.length) throw new Error("The message ends inside a field.");
    const value = buffer.subarray(offset, offset + length);
    offset += length;
    return value;
  }

  while (offset < buffer.length) {
    const key = readVarint();
    const field = Number(key >> 3n);
    const wire = Number(key & 7n);
    if (wire === VARINT) fields.push({ field, value: readVarint() });
    else if (wire === LENGTH_DELIMITED) fields.push({ field, value: take(Number(readVarint())) });
    else if (wire === FIXED64) fields.push({ field, value: take(8) });
    else if (wire === FIXED32) fields.push({ field, value: take(4) });
    else throw new Error(`Unknown field type ${wire}.`);
  }
  return fields;
}

export function fieldValues(fields, field) {
  return fields.filter((item) => item.field === field).map((item) => item.value);
}

function varint(number) {
  let remaining = BigInt(number);
  const bytes = [];
  while (remaining > 0x7fn) {
    bytes.push(Number(remaining & 0x7fn) | 0x80);
    remaining >>= 7n;
  }
  bytes.push(Number(remaining));
  return Buffer.from(bytes);
}
