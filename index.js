const { Reader, Writer } = require('oer-utils')

const TYPE_ACK = 1
const TYPE_RESPONSE = 2
const TYPE_CUSTOM_RESPONSE = 3
const TYPE_PREPARE = 4
const TYPE_FULFILL = 5
const TYPE_REJECT = 6
const TYPE_MESSAGE = 7
const TYPE_CUSTOM_REQUEST = 8

function writeEnvelope (type, contents) {
  const writer = new Writer()

  writer.writeUInt8(type)
  writer.writeVarOctetString(contents)

  return writer.toBuffer()
}

function writeSideData (sideData) {
  const writer = new Writer()
  const lengthPrefixLengthPrefix = 1
  const lengthPrefix = sideData.length

  writer.writeUInt8(lengthPrefixLengthPrefix)
  writer.writeUInt8(lengthPrefix)

  for (const k of Object.keys(sideData)) {
    writer.writeVarOctetString(Buffer.from(k, 'ascii'))
    writer.writeVarOctetString(sideData[k])
  }
}

function serializeAck (sideData) {
  const writer = new Writer()
  writeSideData(writer, sideData)
  
  return writeEnvelope(TYPE_ACK, writer.toBuffer())
}
