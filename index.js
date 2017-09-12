'use strict'

const { Reader, Writer } = require('oer-utils')
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
const MIME_APPLICATION_OCTET_STRING = 0
const MIME_TEXT_PLAIN_UTF8 = 1
const MIME_APPLICATION_JSON = 2

function typeToString (type) {
  switch (type) {
    case TYPE_ACK: return 'TYPE_ACK'
    case TYPE_RESPONSE: return 'TYPE_RESPONSE'
    case TYPE_ERROR: return 'TYPE_ERROR'
    case TYPE_PREPARE: return 'TYPE_PREPARE'
    case TYPE_FULFILL: return 'TYPE_FULFILL'
    case TYPE_REJECT: return 'TYPE_REJECT'
    case TYPE_MESSAGE: return 'TYPE_MESSAGE'
    default: throw new Error('Unrecognized clp packet type')
  }
}

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

function maybeSerializeIlpError (error) {
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

function writeError (writer, data) {
  const ilpPacket = maybeSerializeIlpError(data.rejectionReason)
  writer.write(ilpPacket)
  writeProtocolData(writer, data.protocolData)
}

function writePrepare (writer, data) {
  const transferIdBuffer = Buffer.from(data.transferId.replace(/-/g, ''), 'hex')
  const amountAsPair = stringToTwoNumbers(data.amount)
  const executionConditionBuffer = data.executionCondition
  const expiresAtBuffer = toGeneralizedTimeBuffer(data.expiresAt)
  writer.write(transferIdBuffer)
  writer.writeUInt64(amountAsPair)
  writer.write(executionConditionBuffer)
  writer.writeVarOctetString(expiresAtBuffer)
  writeProtocolData(writer, data.protocolData)
}

function writeFulfill (writer, data) {
  const transferIdBuffer = Buffer.from(data.transferId.replace(/-/g, ''), 'hex')
  const fulfillmentBuffer = data.fulfillment
  writer.write(transferIdBuffer)
  writer.write(fulfillmentBuffer)
  writeProtocolData(writer, data.protocolData)
}

function writeReject (writer, data) {
  const transferIdBuffer = Buffer.from(data.transferId.replace(/-/g, ''), 'hex')
  const rejectionReasonBuffer = maybeSerializeIlpError(data.rejectionReason)
  writer.write(transferIdBuffer)
  writer.write(rejectionReasonBuffer)
  writeProtocolData(writer, data.protocolData)
}

function serialize (obj) {
  const writer = new Writer()
  switch (obj.type) {
    case TYPE_ACK:
    case TYPE_RESPONSE:
    case TYPE_MESSAGE:
      writeProtocolData(writer, obj.data) // see https://github.com/interledger/rfcs/issues/284
      break

    case TYPE_ERROR:
      writeError(writer, obj.data)
      break

    case TYPE_PREPARE:
      writePrepare(writer, obj.data)
      break

    case TYPE_FULFILL:
      writeFulfill(writer, obj.data)
      break

    case TYPE_REJECT:
      writeReject(writer, obj.data)
      break

    default:
      throw new Error('Unrecognized type')
  }

  const envelopeWriter = new Writer()
  envelopeWriter.writeUInt8(obj.type)
  envelopeWriter.writeUInt32(obj.requestId)
  envelopeWriter.writeVarOctetString(writer.getBuffer())
  return envelopeWriter.getBuffer()
}

function readError (reader) {
  const rejectionReason = readIlpError(reader)
  const protocolData = readProtocolData(reader)
  return { rejectionReason, protocolData }
}

function readPrepare (reader) {
  const transferId = uuidParse.unparse(reader.read(16))
  const amount = twoNumbersToString(reader.readUInt64())
  const executionCondition = reader.read(32)
  const expiresAt = readGeneralizedTime(reader)
  const protocolData = readProtocolData(reader)
  return { transferId, amount, executionCondition, expiresAt, protocolData }
}

function readFulfill (reader) {
  const transferId = uuidParse.unparse(reader.read(16))
  const fulfillment = reader.read(32)
  const protocolData = readProtocolData(reader)
  return { transferId, fulfillment, protocolData }
}

function readReject (reader) {
  const transferId = uuidParse.unparse(reader.read(16))
  const rejectionReason = readIlpError(reader)
  const protocolData = readProtocolData(reader)
  return { transferId, rejectionReason, protocolData }
}

function deserialize (buffer) {
  const envelopeReader = Reader.from(buffer)

  const type = envelopeReader.readUInt8()
  const requestId = envelopeReader.readUInt32()
  const dataBuff = envelopeReader.readVarOctetString()
  const reader = new Reader(dataBuff)

  let data
  switch (type) {
    case TYPE_ACK:
    case TYPE_RESPONSE:
    case TYPE_MESSAGE:
      data = readProtocolData(reader) // see https://github.com/interledger/rfcs/issues/284
      break

    case TYPE_ERROR:
      data = readError(reader)
      break

    case TYPE_PREPARE:
      data = readPrepare(reader)
      break

    case TYPE_FULFILL:
      data = readFulfill(reader)
      break

    case TYPE_REJECT:
      data = readReject(reader)
      break

    default:
      throw new Error('Unrecognized type')
  }

  return { type, requestId, data }
}

module.exports = {
  TYPE_ACK,
  TYPE_RESPONSE,
  TYPE_ERROR,
  TYPE_PREPARE,
  TYPE_FULFILL,
  TYPE_REJECT,
  TYPE_MESSAGE,

  typeToString,

  MIME_APPLICATION_OCTET_STRING,
  MIME_TEXT_PLAIN_UTF8,
  MIME_APPLICATION_JSON,
  // deprecated:
  MIME_APPLICATION_OCTET_STREAM:  MIME_APPLICATION_OCTET_STRING,

  serialize,
  deserialize,

  // The following legacy functions use an alternative format to access the exposed
  // serialize/deserialize functionality. There is one such serialize* function per CLP call.
  // The arguments passed to them is different from the structure of CLP's OER encoding.
  // Therefore, these functions are marked as 'legacy functions' here; however, we did not remove them because
  // they are already used by the payment plugin framework.

  serializeAck (requestId, protocolData) {
    return serialize({
      type: TYPE_ACK,
      requestId,
      data: protocolData
    })
  },
  serializeResponse (requestId, protocolData) {
    return serialize({
      type: TYPE_RESPONSE,
      requestId,
      data: protocolData
    })
  },
  serializeError ({ rejectionReason }, requestId, protocolData) {
    return serialize({
      type: TYPE_ERROR,
      requestId,
      data: {
        rejectionReason,
        protocolData
      }
    })
  },
  serializePrepare ({ transferId, amount, executionCondition, expiresAt }, requestId, protocolData) {
    return serialize({
      type: TYPE_PREPARE,
      requestId,
      data: {
        transferId,
        amount,
        executionCondition,
        expiresAt,
        protocolData
      }
    })
  },
  serializeFulfill ({ transferId, fulfillment }, requestId, protocolData) {
    return serialize({
      type: TYPE_FULFILL,
      requestId,
      data: {
        transferId,
        fulfillment,
        protocolData
      }
    })
  },
  serializeReject ({ transferId, rejectionReason }, requestId, protocolData) {
    return serialize({
      type: TYPE_REJECT,
      requestId,
      data: {
        transferId,
        rejectionReason,
        protocolData
      }
    })
  },
  serializeMessage (requestId, protocolData) {
    return serialize({
      type: TYPE_MESSAGE,
      requestId,
      data: protocolData
    })
  }
}
