const { Reader, Writer } = require('oer-utils')

const TYPE_ACK = 1
const TYPE_RESPONSE = 2
const TYPE_CUSTOM_RESPONSE = 3
const TYPE_PREPARE = 4
const TYPE_FULFILL = 5
const TYPE_REJECT = 6
const TYPE_MESSAGE = 7
const TYPE_CUSTOM_REQUEST = 8

function writeEnvelope (type, id, contents) {
  const writer = new Writer()

  writer.writeUInt8(type)
  writer.writeUInt32(id)
  writer.writeVarOctetString(contents)

  return writer.toBuffer()
}

function writeSideData (requestId, sideData) {
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

function serializeAck (requestId, requestId, sideData) {
  const writer = new Writer()
  writeSideData(writer, sideData)
  
  return writeEnvelope(TYPE_ACK, requestId, writer.toBuffer())
}

function serializeResponse ({ ilp }, requestId, requestId, sideData) {
  const writer = new Writer()

  writer.writeBytes(packet)
  writeSideData(writer, sideData)

  return writeEnvelope(TYPE_RESPONSE, requestId, writer.toBuffer())
}

function serializeCustomResponse (requestId, sideData) {
  const writer = new Writer()
  writeSideData(writer, sideData)
  
  return writeEnvelope(TYPE_CUSTOM_RESPONSE, requestId, writer.toBuffer())
}

function serializePrepare ({ id, amount, executionCondition, expiresAt, ilp }, requestId, sideData) {
  const idBuffer = Buffer.from(id.replace(/\-/g, ''), 'hex')
  const amountAsPair = stringToTwoNumbers(amount)
  const executionConditionBuffer = Buffer.from(executionCondition, 'base64')
  const expiresAtBuffer = // TODO: how to write a timestamp
  const packet = Buffer.from(ilp, 'base64')
  const writer = new Writer()

  writer.writeUInt128(idBuffer)
  writer.writeUInt64(amountAsPair)
  writer.writeUInt256(executionConditionBuffer)
  writer.writeVarOctetString(expiresAtBuffer)
  writer.writeBytes(packet)
  writeSideData(sideData)

  return writeEnvelope(TYPE_PREPARE, requestId, writer.toBuffer())
}

function serializeFulfill ({ id, fulfillment }, requestId, sideData) {
  const idBuffer = Buffer.from(id.replace(/\-/g, ''), 'hex')
  const fulfillmentBuffer = Buffer.from(fulfillment, 'base64')
  const writer = new Writer()

  writer.writeUInt128(idBuffer)
  writer.writeUInt256(fulfillmentBuffer)
  writeSideData(sideData)

  return writeEnvelope(TYPE_FULFILL, requestId, writer.toBuffer())
}

function serializeReject ({ id, reason }, requestId, sideData) {
  const idBuffer = Buffer.from(id.replace(/\-/g, ''), 'hex')
  const reasonBuffer = Buffer.from(reason, 'base64')
  const writer = new Writer()

  writer.writeUInt128(idBuffer)
  writer.writeBytes(reasonBuffer)
  writeSideData(sideData)

  return writeEnvelope(TYPE_REJECT, requestId, writer.toBuffer())
}

function serializeMessage ({ ilp }, requestId, sideData) {
  const writer = new Writer()

  writer.writeBytes(packet)
  writeSideData(writer, sideData)

  return writeEnvelope(TYPE_MESSAGE, requestId, writer.toBuffer())
}

function serializeCustomRequest (requestId, sideData) {
  const writer = new Writer()
  writeSideData(writer, sideData)
  
  return writeEnvelope(TYPE_CUSTOM_REQUEST, requestId, writer.toBuffer())
}
