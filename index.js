const { Reader, Writer } = require('oer-utils')
const base64url = require('base64url')
const uuidParse = require('uuid-parse')

const TYPE_ACK = 1
const TYPE_RESPONSE = 2
const TYPE_CUSTOM_RESPONSE = 3
const TYPE_PREPARE = 4
const TYPE_FULFILL = 5
const TYPE_REJECT = 6
const TYPE_MESSAGE = 7
const TYPE_CUSTOM_REQUEST = 8

function readIlpPacket (reader) {
  const type = Buffer.from([ reader.readUInt8() ])
  reader.bookmark()
  const length = Buffer.from([ reader.readLengthPrefix() ])
  reader.restore()
  const contents = reader.readVarOctetString()

  return base64url(Buffer.concat([ type, length, contents ]))
}

function writeEnvelope (type, id, contents) {
  const writer = new Writer()

  writer.writeUInt8(type)
  writer.writeUInt32(id)
  writer.writeVarOctetString(contents)

  return writer.getBuffer()
}

function readEnvelope (envelope) {
  const reader = new Reader(envelope)
  
  const type = reader.readUInt8()
  const requestId = reader.readUInt32()
  const contents = reader.readVarOctetString()

  return {
    type,
    requestId,
    contents
  }
}

function writeSideData (writer, sideData) {
  const lengthPrefixLengthPrefix = 1
  const lengthPrefix = Object.keys(sideData).length

  writer.writeUInt8(lengthPrefixLengthPrefix)
  writer.writeUInt8(lengthPrefix)

  for (const k of Object.keys(sideData)) {
    writer.writeVarOctetString(Buffer.from(k, 'ascii'))
    writer.writeVarOctetString(sideData[k])
  }
}

function readSideData (reader) {
  const lengthPrefixPrefix = reader.readUInt8()
  const lengthPrefix = reader.readUInt8() 
  const sideData = {}

  for (let i = 0; i < lengthPrefix; ++i) {
    const key = reader.readVarOctetString()
    const value = reader.readVarOctetString()
    sideData[key.toString('ascii')] = value
  }

  return sideData
}

function serializeAck (requestId, sideData) {
  const writer = new Writer()
  writeSideData(writer, sideData)

  return writeEnvelope(TYPE_ACK, requestId, writer.getBuffer())
}

function deserializeAck (buffer) {
  const { type, requestId, contents } = readEnvelope(buffer)
  const reader = new Reader(contents)

  const sideData = readSideData(reader)
  return { requestId, sideData }
}

function serializeResponse ({ ilp }, requestId, sideData) {
  const writer = new Writer()
  const packet = Buffer.from(ilp, 'base64')

  writer.write(packet)
  writeSideData(writer, sideData)

  return writeEnvelope(TYPE_RESPONSE, requestId, writer.getBuffer())
}

function deserializeResponse (buffer) {
  const { type, requestId, contents } = readEnvelope(buffer)
  const reader = new Reader(contents)

  const ilp = readIlpPacket(reader)
  const sideData = readSideData(reader)
  return { requestId, ilp, sideData }
}

function serializeCustomResponse (requestId, sideData) {
  const writer = new Writer()
  writeSideData(writer, sideData)
  
  return writeEnvelope(TYPE_CUSTOM_RESPONSE, requestId, writer.getBuffer())
}

function deserializeCustomResponse (buffer) {
  const { type, requestId, contents } = readEnvelope(buffer)
  const reader = new Reader(contents)

  const sideData = readSideData(reader)
  return { requestId, sideData }
}

function serializePrepare ({ id, amount, executionCondition, expiresAt, ilp }, requestId, sideData) {
  const idBuffer = Buffer.from(id.replace(/\-/g, ''), 'hex')
  const amountAsPair = [ 0x00000000, +amount ]
  const executionConditionBuffer = Buffer.from(executionCondition, 'base64')
  const expiresAtBuffer = Buffer.from('') // TODO: how to write a timestamp
  const packet = Buffer.from(ilp, 'base64')
  const writer = new Writer()

  writer.write(idBuffer)
  writer.writeUInt64(amountAsPair)
  writer.write(executionConditionBuffer)
  writer.writeVarOctetString(expiresAtBuffer)
  writer.write(packet)
  writeSideData(writer, sideData)

  return writeEnvelope(TYPE_PREPARE, requestId, writer.getBuffer())
}

function deserializePrepare (buffer) {
  const { type, requestId, contents } = readEnvelope(buffer)
  const reader = new Reader(contents)

  const id = uuidParse.unparse(reader.read(16))
  const amount = reader.readUInt64()[1] + ''
  const executionCondition = base64url(reader.read(32))
  const expiresAt = reader.readUInt8() // TODO: how to read a timestamp
  const ilp = readIlpPacket(reader)
  const sideData = readSideData(reader)

  return { requestId, id, amount, executionCondition, expiresAt, ilp, sideData }
}

function serializeFulfill ({ id, fulfillment }, requestId, sideData) {
  const idBuffer = Buffer.from(id.replace(/\-/g, ''), 'hex')
  const fulfillmentBuffer = Buffer.from(fulfillment, 'base64')
  const writer = new Writer()

  writer.write(idBuffer)
  writer.write(fulfillmentBuffer)
  writeSideData(writer, sideData)

  return writeEnvelope(TYPE_FULFILL, requestId, writer.getBuffer())
}

function deserializeFulfill (buffer) {
  const { type, requestId, contents } = readEnvelope(buffer)
  const reader = new Reader(contents)

  const id = uuidParse.unparse(reader.read(16))
  const fulfillment = base64url(reader.read(32)) 
  const sideData = readSideData(reader)

  return { requestId, id, fulfillment, sideData }
}

function serializeReject ({ id, reason }, requestId, sideData) {
  const idBuffer = Buffer.from(id.replace(/\-/g, ''), 'hex')
  const reasonBuffer = Buffer.from(reason, 'base64')
  const writer = new Writer()

  writer.write(idBuffer)
  writer.write(reasonBuffer)
  writeSideData(writer, sideData)

  return writeEnvelope(TYPE_REJECT, requestId, writer.getBuffer())
}

function deserializeReject (buffer) {
  const { type, requestId, contents } = readEnvelope(buffer)
  const reader = new Reader(contents)

  const id = uuidParse.unparse(reader.read(16))
  const reason = readIlpPacket(reader) 
  const sideData = readSideData(reader)

  return { requestId, id, reason, sideData }
}

function serializeMessage ({ ilp }, requestId, sideData) {
  const packet = Buffer.from(ilp, 'base64')
  const writer = new Writer()

  writer.write(packet)
  writeSideData(writer, sideData)

  return writeEnvelope(TYPE_MESSAGE, requestId, writer.getBuffer())
}

function deserializeMessage (buffer) {
  const { type, requestId, contents } = readEnvelope(buffer)
  const reader = new Reader(contents)

  const ilp = readIlpPacket(reader)
  const sideData = readSideData(reader)
  return { requestId, ilp, sideData }
}

function serializeCustomRequest (requestId, sideData) {
  const writer = new Writer()
  writeSideData(writer, sideData)
  
  return writeEnvelope(TYPE_CUSTOM_REQUEST, requestId, writer.getBuffer())
}

function deserializeCustomRequest (buffer) {
  const { type, requestId, contents } = readEnvelope(buffer)
  const reader = new Reader(contents)

  const sideData = readSideData(reader)
  return { requestId, sideData }
}

module.exports = {
  TYPE_ACK,
  TYPE_RESPONSE,
  TYPE_CUSTOM_RESPONSE,
  TYPE_PREPARE,
  TYPE_FULFILL,
  TYPE_REJECT,
  TYPE_MESSAGE,
  TYPE_CUSTOM_REQUEST,

  serializeAck,
  serializeResponse,
  serializeCustomResponse,
  serializePrepare,
  serializeFulfill,
  serializeReject,
  serializeMessage,
  serializeCustomRequest,

  deserializeAck,
  deserializeResponse,
  deserializeCustomResponse,
  deserializePrepare,
  deserializeFulfill,
  deserializeReject,
  deserializeMessage,
  deserializeCustomRequest
}
