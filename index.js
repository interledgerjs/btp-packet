'use strict'

const { Reader, Writer } = require('oer-utils')
const base64url = require('base64url')
const uuidParse = require('uuid-parse')
const dateFormat = require('dateformat')
const BigNumber = require('bignumber.js')

// These constants are increased by 1 for BTP version Alpha
const TYPE_ACK = 0 // only exists in BTP version Alpha
const TYPE_RESPONSE = 1
const TYPE_ERROR = 2
const TYPE_PREPARE = 3
const TYPE_FULFILL = 4
const TYPE_REJECT = 5
const TYPE_MESSAGE = 6
const TYPE_TRANSFER = 7
const MIME_APPLICATION_OCTET_STREAM = 0
const MIME_TEXT_PLAIN_UTF8 = 1
const MIME_APPLICATION_JSON = 2
const BTP_VERSION_ALPHA = 0
const BTP_VERSION_1 = 1
const BTP_VERSION_1_1 = 2

function typeToVersion (type, btpVersion) {
  if (btpVersion === BTP_VERSION_ALPHA) {
    return type + 1
  }
  return type
}

function typeFromVersion (type, btpVersion) {
  if (btpVersion === BTP_VERSION_ALPHA) {
    return type - 1
  }
  return type
}

function typeToString (type) {
  switch (type) {
    case TYPE_ACK: return 'TYPE_ACK'
    case TYPE_RESPONSE: return 'TYPE_RESPONSE'
    case TYPE_ERROR: return 'TYPE_ERROR'
    case TYPE_PREPARE: return 'TYPE_PREPARE'
    case TYPE_FULFILL: return 'TYPE_FULFILL'
    case TYPE_REJECT: return 'TYPE_REJECT'
    case TYPE_MESSAGE: return 'TYPE_MESSAGE'
    case TYPE_TRANSFER: return 'TYPE_TRANSFER'
    default: throw new Error('Unrecognized BTP packet type')
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
// However, in BTP, all calls have a requestId, even though in LPI only
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
// whole BilateralTransferProtocolPacket, see:
// https://github.com/interledger/rfcs/blob/master/asn1/BilateralTransferProtocol.asn

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

// TODO: move this function to the ilp-packet module, so we don't
// have to parse the same data twice.
function readIlpError (reader) {
  const type = Buffer.from([ reader.readUInt8() ])
  reader.bookmark()
  const length = Buffer.from([ reader.readLengthPrefix() ])
  reader.restore()
  const contents = reader.readVarOctetString()
  return Buffer.concat([ type, length, contents ])
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

function writeTransfer (writer, data, btpVersion = BTP_VERSION_1_1) {
  if (btpVersion < BTP_VERSION_1_1) {
    throw new Error('TYPE_TRANSFER does not exist in earlier version than 1.1')
  }

  const amountAsPair = stringToTwoNumbers(data.amount)
  writer.writeUInt64(amountAsPair)
  writeProtocolData(writer, data.protocolData)
}

function writeError (writer, data, btpVersion = BTP_VERSION_1) {
  if (btpVersion === BTP_VERSION_ALPHA) {
    writer.write(data.rejectionReason)
  } else {
    if (data.code.length !== 3) {
      throw new Error(`error code must be 3 characters, got: "${data.code}"`)
    }

    const codeBuffer = Buffer.from(data.code, 'ascii')
    const nameBuffer = Buffer.from(data.name, 'ascii')
    const triggeredAtBuffer = toGeneralizedTimeBuffer(data.triggeredAt)
    const dataBuffer = Buffer.from(data.data, 'utf8')

    writer.write(codeBuffer)
    writer.writeVarOctetString(nameBuffer)
    writer.writeVarOctetString(triggeredAtBuffer)
    writer.writeVarOctetString(dataBuffer)
  }
  writeProtocolData(writer, data.protocolData)
}

function writePrepare (writer, data) {
  const transferIdBuffer = Buffer.from(data.transferId.replace(/-/g, ''), 'hex')
  const amountAsPair = stringToTwoNumbers(data.amount)
  const executionConditionBuffer = Buffer.from(data.executionCondition, 'base64')
  const expiresAtBuffer = toGeneralizedTimeBuffer(data.expiresAt)
  writer.write(transferIdBuffer)
  writer.writeUInt64(amountAsPair)
  writer.write(executionConditionBuffer)
  writer.writeVarOctetString(expiresAtBuffer)
  writeProtocolData(writer, data.protocolData)
}

function writeFulfill (writer, data) {
  const transferIdBuffer = Buffer.from(data.transferId.replace(/-/g, ''), 'hex')
  const fulfillmentBuffer = Buffer.from(data.fulfillment, 'base64')
  writer.write(transferIdBuffer)
  writer.write(fulfillmentBuffer)
  writeProtocolData(writer, data.protocolData)
}

function writeReject (writer, data, btpVersion = BTP_VERSION_1) {
  const transferIdBuffer = Buffer.from(data.transferId.replace(/-/g, ''), 'hex')
  writer.write(transferIdBuffer)
  if (btpVersion === BTP_VERSION_ALPHA) {
    writer.write(data.rejectionReason)
  }
  writeProtocolData(writer, data.protocolData)
}

function serialize (obj, btpVersion = BTP_VERSION_1_1) {
  const contentsWriter = new Writer()
  switch (obj.type) {
    case TYPE_ACK:
    case TYPE_RESPONSE:
    case TYPE_MESSAGE:
      if (btpVersion === BTP_VERSION_ALPHA) {
        writeProtocolData(contentsWriter, obj.data)
      } else {
        writeProtocolData(contentsWriter, obj.data.protocolData)
      }
      break

    case TYPE_TRANSFER:
      writeTransfer(contentsWriter, obj.data, btpVersion)
      break

    case TYPE_ERROR:
      writeError(contentsWriter, obj.data, btpVersion)
      break

    case TYPE_PREPARE:
      writePrepare(contentsWriter, obj.data)
      break

    case TYPE_FULFILL:
      writeFulfill(contentsWriter, obj.data)
      break

    case TYPE_REJECT:
      writeReject(contentsWriter, obj.data, btpVersion)
      break

    default:
      throw new Error('Unrecognized type')
  }

  const envelopeWriter = new Writer()
  envelopeWriter.writeUInt8(typeToVersion(obj.type, btpVersion))
  envelopeWriter.writeUInt32(obj.requestId)
  envelopeWriter.writeVarOctetString(contentsWriter.getBuffer())
  return envelopeWriter.getBuffer()
}

function readTransfer (reader, btpVersion = BTP_VERSION_1_1) {
  if (btpVersion < BTP_VERSION_1_1) {
    throw new Error('TYPE_TRANSFER does not exist in earlier version than 1.1')
  }

  const amount = twoNumbersToString(reader.readUInt64())
  const protocolData = readProtocolData(reader)
  return { amount, protocolData }
}

function readError (reader, btpVersion = BTP_VERSION_1) {
  if (btpVersion === BTP_VERSION_ALPHA) {
    const rejectionReason = readIlpError(reader)
    const protocolData = readProtocolData(reader)
    return {
      rejectionReason,
      protocolData
    }
  }

  const code = reader.read(3).toString('ascii')
  const name = reader.readVarOctetString().toString('ascii')
  const triggeredAt = readGeneralizedTime(reader)
  const data = reader.readVarOctetString().toString('utf8')
  const protocolData = readProtocolData(reader)

  return { code, name, triggeredAt, data, protocolData }
}

function readPrepare (reader) {
  const transferId = uuidParse.unparse(reader.read(16))
  const amount = twoNumbersToString(reader.readUInt64())
  const executionCondition = base64url(reader.read(32))
  const expiresAt = readGeneralizedTime(reader)
  const protocolData = readProtocolData(reader)
  return { transferId, amount, executionCondition, expiresAt, protocolData }
}

function readFulfill (reader) {
  const transferId = uuidParse.unparse(reader.read(16))
  const fulfillment = base64url(reader.read(32))
  const protocolData = readProtocolData(reader)
  return { transferId, fulfillment, protocolData }
}

function readReject (reader, btpVersion = BTP_VERSION_1) {
  const transferId = uuidParse.unparse(reader.read(16))
  if (btpVersion === BTP_VERSION_ALPHA) {
    const rejectionReason = readIlpError(reader)
    const protocolData = readProtocolData(reader)
    return { transferId, rejectionReason, protocolData }
  }
  const protocolData = readProtocolData(reader)
  return { transferId, protocolData }
}

function deserialize (buffer, btpVersion = BTP_VERSION_1_1) {
  const envelopeReader = Reader.from(buffer)

  const type = typeFromVersion(envelopeReader.readUInt8(), btpVersion)
  const requestId = envelopeReader.readUInt32()
  const dataBuff = envelopeReader.readVarOctetString()
  const reader = new Reader(dataBuff)
  let data
  switch (type) {
    case TYPE_ACK:
    case TYPE_RESPONSE:
    case TYPE_MESSAGE:
      if (btpVersion === BTP_VERSION_ALPHA) {
        data = readProtocolData(reader)
      } else {
        data = {protocolData: readProtocolData(reader)}
      }
      break

    case TYPE_TRANSFER:
      data = readTransfer(reader, btpVersion)
      break

    case TYPE_ERROR:
      data = readError(reader, btpVersion)
      break

    case TYPE_PREPARE:
      data = readPrepare(reader)
      break

    case TYPE_FULFILL:
      data = readFulfill(reader)
      break

    case TYPE_REJECT:
      data = readReject(reader, btpVersion)
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
  TYPE_TRANSFER,

  typeToString,

  MIME_APPLICATION_OCTET_STREAM,
  MIME_APPLICATION_OCTET_STRING: MIME_APPLICATION_OCTET_STREAM, // deprecated since https://github.com/interledger/rfcs/pull/291/files#diff-2c87a4d4e57dd9430f40e0fe2b4d295aR39
  MIME_TEXT_PLAIN_UTF8,
  MIME_APPLICATION_JSON,

  BTP_VERSION_ALPHA,
  BTP_VERSION_1,

  serialize,
  deserialize,

  // The following functions use an alternative format to access the exposed
  // serialize/deserialize functionality. There is one such serialize* function per BTP call.
  // The arguments passed to them are aligned with the objects defined in the Ledger-Plugin-Interface (LPI),
  // which makes these functions convenient to use when working with LPI objects.
  serializeAck (requestId, protocolData) {
    return serialize({
      type: TYPE_ACK,
      requestId,
      data: protocolData
    }, BTP_VERSION_ALPHA)
  },
  serializeResponse (requestId, protocolData, btpVersion = BTP_VERSION_1) {
    return serialize({
      type: TYPE_RESPONSE,
      requestId,
      data: (btpVersion === BTP_VERSION_ALPHA ? protocolData : { protocolData })
    }, btpVersion)
  },
  serializeError (error, requestId, protocolData, btpVersion = BTP_VERSION_1) {
    let dataFields
    if (btpVersion === BTP_VERSION_ALPHA) {
      dataFields = { rejectionReason: error.rejectionReason, protocolData }
    } else {
      const { code, name, triggeredAt, data } = error
      dataFields = { code, name, triggeredAt, data, protocolData }
    }
    return serialize({
      type: TYPE_ERROR,
      requestId,
      data: dataFields
    }, btpVersion)
  },
  serializePrepare (transfer, requestId, protocolData, btpVersion = BTP_VERSION_1) {
    const { transferId, amount, executionCondition, expiresAt } = transfer
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
    }, btpVersion)
  },
  serializeFulfill (fulfill, requestId, protocolData, btpVersion = BTP_VERSION_1) {
    const { transferId, fulfillment } = fulfill
    return serialize({
      type: TYPE_FULFILL,
      requestId,
      data: {
        transferId,
        fulfillment,
        protocolData
      }
    }, btpVersion)
  },
  serializeReject (reject, requestId, protocolData, btpVersion = BTP_VERSION_1) {
    let data = { transferId: reject.transferId, protocolData }
    if (btpVersion === BTP_VERSION_ALPHA) {
      data.rejectionReason = reject.rejectionReason
    }
    return serialize({
      type: TYPE_REJECT,
      requestId,
      data
    }, btpVersion)
  },
  serializeMessage (requestId, protocolData, btpVersion = BTP_VERSION_1) {
    return serialize({
      type: TYPE_MESSAGE,
      requestId,
      data: (btpVersion === BTP_VERSION_ALPHA ? protocolData : { protocolData })
    }, btpVersion)
  },
  serializeTransfer (transfer, requestId, protocolData, btpVersion = BTP_VERSION_1_1) {
    if (btpVersion < BTP_VERSION_1_1) {
      throw new Error('TYPE_TRANSFER does not exist in earlier version than 1.1')
    }
    const { amount } = transfer
    return serialize({
      type: TYPE_TRANSFER,
      requestId,
      data: {
        amount,
        protocolData
      }
    }, btpVersion)
  }
}
