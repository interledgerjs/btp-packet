const { Reader, Writer } = require('oer-utils')
const base64url = require('base64url')
const uuidParse = require('uuid-parse')
const dateFormat = require('dateformat')
const BigNumber = require('bignumber.js')

const TYPE_ACK = 1
const TYPE_RESPONSE = 2
const TYPE_ERROR = 3
const TYPE_PREPARE = 4
const TYPE_FULFILL = 5
const TYPE_REJECT = 6
const TYPE_MESSAGE = 7
const MIME_APPLICATION_OCTET_STREAM = 0
const MIME_TEXT_PLAIN_UTF8 = 1
const MIME_APPLICATION_JSON = 2

const HIGH_WORD_MULTIPLIER = 0x100000000
const GENERALIZED_TIME_REGEX =
  /^([0-9]{4})([0-9]{2})([0-9]{2})([0-9]{2})([0-9]{2})([0-9]{2}\.[0-9]{3}Z)$/

function twoNumbersToString (num) {
  const [ hi, lo ] = num
  const uint64 = new BigNumber(hi).times(HIGH_WORD_MULTIPLIER).add(lo)
  return uint64.toString(10)
}

function stringToTwoNumbers (num) {
  const uint64 = new BigNumber(num)
  return [
    uint64.dividedToIntegerBy(HIGH_WORD_MULTIPLIER).toNumber(),
    uint64.modulo(HIGH_WORD_MULTIPLIER).toNumber()
  ]
}

function toGeneralizedTime (date) {
  return Buffer.from(dateFormat(date, "UTC:yyyymmddHHMMss.l'Z'"))
}

function readGeneralizedTime (reader) {
  const generalizedTime = reader.readVarOctetString().toString()
  const date = generalizedTime.replace(
    GENERALIZED_TIME_REGEX,
    '$1-$2-$3T$4:$5:$6')

  return new Date(date)
}

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

function writeProtocolData (writer, protocolData) {
  const lengthPrefix = protocolData.length
  const lengthPrefixLengthPrefix = Math.max(1,
    Math.ceil((Math.log(protocolData.length + 1) / Math.log(2)) / 8))

  writer.writeUInt8(lengthPrefixLengthPrefix)
  writer.writeUInt(lengthPrefix, lengthPrefixLengthPrefix)

  for (const p of protocolData) {
    writer.writeVarOctetString(Buffer.from(p.name, 'ascii'))
    writer.writeUInt8(p.contentType)
    writer.writeVarOctetString(p.data)
  }
}

function readProtocolData (reader) {
  const lengthPrefixPrefix = reader.readUInt8()
  const lengthPrefix = reader.readUInt(lengthPrefixPrefix) 
  const protocolData = []

  for (let i = 0; i < lengthPrefix; ++i) {
    const name = reader.readVarOctetString().toString('ascii')
    const contentType = reader.readUInt8()
    const data = reader.readVarOctetString()

    protocolData.push({ name, contentType, data })
  }

  return protocolData
}

function serializeAck (requestId, protocolData) {
  const writer = new Writer()
  writeProtocolData(writer, protocolData)

  return writeEnvelope(TYPE_ACK, requestId, writer.getBuffer())
}

function deserializeAck (buffer) {
  const { type, requestId, contents } = readEnvelope(buffer)
  const reader = new Reader(contents)

  const protocolData = readProtocolData(reader)
  return { requestId, protocolData }
}

function serializeResponse (requestId, protocolData) {
  const writer = new Writer()
  writeProtocolData(writer, protocolData)

  return writeEnvelope(TYPE_RESPONSE, requestId, writer.getBuffer())
}

function deserializeResponse (buffer) {
  const { type, requestId, contents } = readEnvelope(buffer)
  const reader = new Reader(contents)

  const protocolData = readProtocolData(reader)
  return { requestId, protocolData }
}

function serializeError ({ ilp }, requestId, protocolData) {
  const writer = new Writer()
  const packet = Buffer.from(ilp, 'base64')

  writer.write(packet)
  writeProtocolData(writer, protocolData)

  return writeEnvelope(TYPE_ERROR, requestId, writer.getBuffer())
}

function deserializeError (buffer) {
  const { type, requestId, contents } = readEnvelope(buffer)
  const reader = new Reader(contents)

  const ilp = readIlpPacket(reader)
  const protocolData = readProtocolData(reader)
  return { requestId, ilp, protocolData }
}

function serializePrepare ({ id, amount, executionCondition, expiresAt }, requestId, protocolData) {
  const idBuffer = Buffer.from(id.replace(/\-/g, ''), 'hex')
  const amountAsPair = stringToTwoNumbers(amount)
  const executionConditionBuffer = Buffer.from(executionCondition, 'base64')
  const expiresAtBuffer = toGeneralizedTime(expiresAt) // TODO: how to write a timestamp
  const writer = new Writer()

  writer.write(idBuffer)
  writer.writeUInt64(amountAsPair)
  writer.write(executionConditionBuffer)
  writer.writeVarOctetString(expiresAtBuffer)
  writeProtocolData(writer, protocolData)

  return writeEnvelope(TYPE_PREPARE, requestId, writer.getBuffer())
}

function deserializePrepare (buffer) {
  const { type, requestId, contents } = readEnvelope(buffer)
  const reader = new Reader(contents)

  const id = uuidParse.unparse(reader.read(16))
  const amount = twoNumbersToString(reader.readUInt64())
  const executionCondition = base64url(reader.read(32))
  const expiresAt = readGeneralizedTime(reader) // TODO: how to read a timestamp
  const protocolData = readProtocolData(reader)

  return { requestId, id, amount, executionCondition, expiresAt, protocolData }
}

function serializeFulfill ({ id, fulfillment }, requestId, protocolData) {
  const idBuffer = Buffer.from(id.replace(/\-/g, ''), 'hex')
  const fulfillmentBuffer = Buffer.from(fulfillment, 'base64')
  const writer = new Writer()

  writer.write(idBuffer)
  writer.write(fulfillmentBuffer)
  writeProtocolData(writer, protocolData)

  return writeEnvelope(TYPE_FULFILL, requestId, writer.getBuffer())
}

function deserializeFulfill (buffer) {
  const { type, requestId, contents } = readEnvelope(buffer)
  const reader = new Reader(contents)

  const id = uuidParse.unparse(reader.read(16))
  const fulfillment = base64url(reader.read(32)) 
  const protocolData = readProtocolData(reader)

  return { requestId, id, fulfillment, protocolData }
}

function serializeReject ({ id, reason }, requestId, protocolData) {
  const idBuffer = Buffer.from(id.replace(/\-/g, ''), 'hex')
  const reasonBuffer = Buffer.from(reason, 'base64')
  const writer = new Writer()

  writer.write(idBuffer)
  writer.write(reasonBuffer)
  writeProtocolData(writer, protocolData)

  return writeEnvelope(TYPE_REJECT, requestId, writer.getBuffer())
}

function deserializeReject (buffer) {
  const { type, requestId, contents } = readEnvelope(buffer)
  const reader = new Reader(contents)

  const id = uuidParse.unparse(reader.read(16))
  const reason = readIlpPacket(reader) 
  const protocolData = readProtocolData(reader)

  return { requestId, id, reason, protocolData }
}

function serializeMessage (requestId, protocolData) {
  const writer = new Writer()

  writeProtocolData(writer, protocolData)

  return writeEnvelope(TYPE_MESSAGE, requestId, writer.getBuffer())
}

function deserializeMessage (buffer) {
  const { type, requestId, contents } = readEnvelope(buffer)
  const reader = new Reader(contents)

  const protocolData = readProtocolData(reader)
  return { requestId, protocolData }
}

module.exports = {
  TYPE_ACK,
  TYPE_RESPONSE,
  TYPE_ERROR,
  TYPE_PREPARE,
  TYPE_FULFILL,
  TYPE_REJECT,
  TYPE_MESSAGE,
  MIME_APPLICATION_OCTET_STREAM,
  MIME_TEXT_PLAIN_UTF8,
  MIME_APPLICATION_JSON,

  serializeAck,
  serializeResponse,
  serializeError,
  serializePrepare,
  serializeFulfill,
  serializeReject,
  serializeMessage,

  deserializeAck,
  deserializeResponse,
  deserializeError,
  deserializePrepare,
  deserializeFulfill,
  deserializeReject,
  deserializeMessage
}
