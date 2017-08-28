'use strict'

const { Reader, Writer } = require('oer-utils')
const base64url = require('base64url')
const uuidParse = require('uuid-parse')
const dateFormat = require('dateformat')
const BigNumber = require('bignumber.js')
const { deserializeIlpError, serializeIlpError } = require('ilp-packet')

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

// Notes about variable naming - comparison with LedgerPluginInterface (IL-RFC-4):
//
// Message / Response / Error corresponds to sendRequest in the
// LedgerPluginInterface, see:
// https://interledger.org/rfcs/0004-ledger-plugin-interface/#sendrequest
//
// The requestId variable in Message corresponds to the 'id' field in the
// Message class of the LedgerPluginInterface, see:
// https://interledger.org/rfcs/0004-ledger-plugin-interface/#class-message
// However, in CLP, all calls have a requestId, even though in LPI only
// sendRequest does.
//
// Prepare / Fulfill / Reject correspond to
// sendTransfer / fulfillCondition / rejectIncomingTransfer in the LPI.
// The transferId variable in them corresponds to the 'id' field in the
// Transfer class of the LedgerPluginInterface, see:
// https://interledger.org/rfcs/0004-ledger-plugin-interface/#class-transfer
//
// Notes about variable naming - comparison with asn.1 definition:
//
// The term 'Envelope' here correspond to the
// whole CommonLedgerProtocolPacket, see:
// https://github.com/interledger/rfcs/blob/master/asn1/CommonLedgerProtocol.asn

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

function toGeneralizedTimeBuffer (date) {
  return Buffer.from(dateFormat(date, "UTC:yyyymmddHHMMss.l'Z'"))
}

function readGeneralizedTime (reader) {
  const generalizedTime = reader.readVarOctetString().toString()
  const date = generalizedTime.replace(
    GENERALIZED_TIME_REGEX,
    '$1-$2-$3T$4:$5:$6')

  return new Date(date)
}

function maybeSerializeIlpError(error) {
  if (Buffer.isBuffer(error)) {
    return error
  }
  if (typeof error === 'string') {
    return Buffer.from(error, 'base64')
  }
  return serializeIlpError(error)
}

// TODO: move this function to the ilp-packet module, so we don't
// have to parse the same data twice.
function readIlpError (reader) {
  const type = Buffer.from([ reader.readUInt8() ])
  reader.bookmark()
  const length = Buffer.from([ reader.readLengthPrefix() ])
  reader.restore()
  const contents = reader.readVarOctetString()
  return deserializeIlpError(Buffer.concat([ type, length, contents ]))
}

function writeEnvelope (type, requestId, contents) {
  const writer = new Writer()
  writer.writeUInt8(type)
  writer.writeUInt32(requestId)
  writer.writeVarOctetString(contents)

  return writer.getBuffer()
}

function readEnvelope (envelope) {
  const reader = Reader.from(envelope)

  const type = reader.readUInt8()
  const requestId = reader.readUInt32()
  const data = reader.readVarOctetString()

  return {
    type,
    requestId,
    data
  }
}

function writeProtocolData (writer, protocolData) {
  if (!Array.isArray(protocolData)) {
    throw new Error('protocolData must be an array')
  }

  const lengthPrefix = protocolData.length
  const lengthPrefixLengthPrefix = Math.max(1,
    Math.ceil((Math.log(protocolData.length + 1) / Math.log(2)) / 8))

  writer.writeUInt8(lengthPrefixLengthPrefix)
  writer.writeUInt(lengthPrefix, lengthPrefixLengthPrefix)

  for (const p of protocolData) {
    writer.writeVarOctetString(Buffer.from(p.protocolName, 'ascii'))
    writer.writeUInt8(p.contentType)
    writer.writeVarOctetString(p.data)
  }
}

function readProtocolData (reader) {
  const lengthPrefixPrefix = reader.readUInt8()
  const lengthPrefix = reader.readUInt(lengthPrefixPrefix)
  const protocolData = []

  for (let i = 0; i < lengthPrefix; ++i) {
    const protocolName = reader.readVarOctetString().toString('ascii')
    const contentType = reader.readUInt8()
    const data = reader.readVarOctetString()
    protocolData.push({
      protocolName,
      contentType,
      data
    })
  }

  return protocolData
}

function serializeAck (requestId, protocolData) {
  const writer = new Writer()
  writeProtocolData(writer, protocolData)

  return writeEnvelope(TYPE_ACK, requestId, writer.getBuffer())
}

function deserializeAck (buffer) {
  const { requestId, data } = readEnvelope(buffer)
  const reader = new Reader(data)

  const protocolData = readProtocolData(reader)
  return { requestId, protocolData }
}

function serializeResponse (requestId, protocolData) {
  const writer = new Writer()
  writeProtocolData(writer, protocolData)

  return writeEnvelope(TYPE_RESPONSE, requestId, writer.getBuffer())
}

function deserializeResponse (buffer) {
  const { requestId, data } = readEnvelope(buffer)
  const reader = new Reader(data)

  const protocolData = readProtocolData(reader)
  return { requestId, protocolData }
}

function serializeError ({ rejectionReason }, requestId, protocolData) {
  const writer = new Writer()
  const ilpPacket = maybeSerializeIlpError(rejectionReason)
  writer.write(ilpPacket)
  writeProtocolData(writer, protocolData)

  return writeEnvelope(TYPE_ERROR, requestId, writer.getBuffer())
}

function deserializeError (buffer) {
  const { requestId, data } = readEnvelope(buffer)
  const reader = new Reader(data)
  const rejectionReason = readIlpError(reader)
  const protocolData = readProtocolData(reader)
  return { requestId, rejectionReason, protocolData }
}

function serializePrepare ({ transferId, amount, executionCondition, expiresAt }, requestId, protocolData) {
  const transferIdBuffer = Buffer.from(transferId.replace(/-/g, ''), 'hex')
  const amountAsPair = stringToTwoNumbers(amount)
  const executionConditionBuffer = Buffer.from(executionCondition, 'base64')
  const expiresAtBuffer = toGeneralizedTimeBuffer(expiresAt)
  const writer = new Writer()

  writer.write(transferIdBuffer)
  writer.writeUInt64(amountAsPair)
  writer.write(executionConditionBuffer)
  writer.writeVarOctetString(expiresAtBuffer)
  writeProtocolData(writer, protocolData)

  return writeEnvelope(TYPE_PREPARE, requestId, writer.getBuffer())
}

function deserializePrepare (buffer) {
  const { requestId, data } = readEnvelope(buffer)
  const reader = new Reader(data)

  const transferId = uuidParse.unparse(reader.read(16))
  const amount =twoNumbersToString(reader.readUInt64())
  const executionCondition = base64url(reader.read(32))
  const expiresAt = readGeneralizedTime(reader)
  const protocolData = readProtocolData(reader)

  return { requestId, transferId, amount, executionCondition, expiresAt, protocolData }
}

function serializeFulfill ({ transferId, fulfillment }, requestId, protocolData) {
  const transferIdBuffer = Buffer.from(transferId.replace(/-/g, ''), 'hex')
  const fulfillmentBuffer = Buffer.from(fulfillment, 'base64')
  const writer = new Writer()

  writer.write(transferIdBuffer)
  writer.write(fulfillmentBuffer)
  writeProtocolData(writer, protocolData)

  return writeEnvelope(TYPE_FULFILL, requestId, writer.getBuffer())
}

function deserializeFulfill (buffer) {
  const { requestId, data } = readEnvelope(buffer)
  const reader = new Reader(data)

  const transferId = uuidParse.unparse(reader.read(16))
  const fulfillment = base64url(reader.read(32))
  const protocolData = readProtocolData(reader)

  return { requestId, transferId, fulfillment, protocolData }
}

function serializeReject ({ transferId, rejectionReason }, requestId, protocolData) {
  const transferIdBuffer = Buffer.from(transferId.replace(/-/g, ''), 'hex')
  const rejectionReasonBuffer = maybeSerializeIlpError(rejectionReason)

  const writer = new Writer()
  writer.write(transferIdBuffer)
  writer.write(rejectionReasonBuffer)
  writeProtocolData(writer, protocolData)

  return writeEnvelope(TYPE_REJECT, requestId, writer.getBuffer())
}

function deserializeReject (buffer) {
  const { requestId, data } = readEnvelope(buffer)
  const reader = new Reader(data)

  const transferId = uuidParse.unparse(reader.read(16))
  const rejectionReason = readIlpError(reader)
  const protocolData = readProtocolData(reader)

  return { requestId, transferId, rejectionReason, protocolData }
}

function serializeMessage (requestId, protocolData) {
  const writer = new Writer()

  writeProtocolData(writer, protocolData)

  return writeEnvelope(TYPE_MESSAGE, requestId, writer.getBuffer())
}

function deserializeMessage (buffer) {
  const { requestId, data } = readEnvelope(buffer)
  const reader = new Reader(data)

  const protocolData = readProtocolData(reader)
  return { requestId, protocolData }
}

function deserializeClpPacket (buffer) {
  const {typeString, packet} = _toTypeString(buffer)
  return {
    type: buffer[0],
    typeString,
    packet
  }
}

function _toTypeString (buffer) {
  switch (buffer[0]) {
    case TYPE_ACK: return {
      typeString: 'clp_ack',
      packet: deserializeAck(buffer) }
    case TYPE_RESPONSE: return {
      typeString: 'clp_response',
      packet: deserializeResponse(buffer) }
    case TYPE_ERROR: return {
      typeString: 'clp_error',
      packet: deserializeError(buffer) }
    case TYPE_PREPARE: return {
      typeString: 'clp_prepare',
      packet: deserializePrepare(buffer) }
    case TYPE_FULFILL: return {
      typeString: 'clp_fulfill',
      packet: deserializeFulfill(buffer) }
    case TYPE_REJECT: return {
      typeString: 'clp_reject',
      packet: deserializeReject(buffer) }
    case TYPE_MESSAGE: return {
      typeString: 'clp_message',
      packet: deserializeMessage(buffer) }
    default:
      throw new Error('Packet has invalid type')
  }
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
  deserializeMessage,
  deserializeClpPacket
}
