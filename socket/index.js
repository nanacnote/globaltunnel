module.exports = (function () {
  let buffer = Buffer.alloc(0);
  return function (data, socket) {
    buffer = Buffer.concat([buffer, data]);
    while (buffer.length >= 2) {
      const isFinalFragment = (buffer[0] & 0x80) !== 0;
      const opcode = buffer[0] & 0x0f;
      const isMasked = (buffer[1] & 0x80) !== 0;
      let payloadLength = buffer[1] & 0x7f;
      let headerLength = 2;

      if (payloadLength === 126) {
        payloadLength = buffer.readUInt16BE(2);
        headerLength += 2;
      } else if (payloadLength === 127) {
        payloadLength =
          buffer.readUInt32BE(2) * Math.pow(2, 32) + buffer.readUInt32BE(6);
        headerLength += 8;
      }

      if (buffer.length < headerLength + payloadLength) {
        break; // Not enough data yet, wait for more
      }

      let payloadStart = headerLength;
      if (isMasked) {
        const mask = buffer.slice(headerLength, headerLength + 4);
        payloadStart += 4;
        for (let i = 0; i < payloadLength; i++) {
          buffer[payloadStart + i] ^= mask[i % 4];
        }
      }

      const payload = buffer.slice(payloadStart, payloadStart + payloadLength);
      buffer = buffer.slice(headerLength + payloadLength);

      // Process the payload here
      console.log("Received payload:", payload.toString());

      if (isFinalFragment && opcode === 0x8) {
        // Close frame received, handle connection closure
        socket.end();
      }
    }
  };
})();
