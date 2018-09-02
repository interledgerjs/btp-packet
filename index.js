'use strict'

const { Reader, Writer } = require('oer-utils')
const dateFormat = require('dateformat')
const BigNumber = require('bignumber.js')

// These constants are increased by 1 for BTP version Alpha
const TYPE_RESPONSE = 1
const TYPE_ERROR = 2
const TYPE_MESSAGE = 6
const TYPE_TRANSFER = 7
const MIME_APPLICATION_OCTET_STREAM = 0
const MIME_TEXT_PLAIN_UTF8 = 1
const MIME_APPLICATION_JSON = 2

function typeToString (type) {
  switch (type) {
    case TYPE_RESPONSE: return 'TYPE_RESPONSE'
    case TYPE_ERROR: return 'TYPE_ERROR'
    case TYPE_MESSAGE: return 'TYPE_MESSAGE'
    case TYPE_TRANSFER: return 'TYPE_TRANSFER'
    default: throw new Error('Unrecognized BTP packet type')
  }
}

const GENERALIZED_TIME_REGEX =
  /^([0-9]{4})([0-9]{2})([0-9]{2})([0-9]{2})([0-9]{2})([0-9]{2}\.[0-9]{3}Z)$/

// Notes about variable naming - comparison with asn.1 definition:
//
// The term 'Envelope' here correspond to the
// whole BilateralTransferProtocolPacket, see:
// https://github.com/interledger/rfcs/blob/master/asn1/BilateralTransferProtocol.asn

function base64url (input) {
  return input.toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
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
  const lengthPrefixPrefix = +reader.readUInt8()
  const lengthPrefix = +reader.readUInt(lengthPrefixPrefix)
  const protocolData = []
  for (let i = 0; i < lengthPrefix; ++i) {
    const protocolName = reader.readVarOctetString().toString('ascii')
    const contentType = +reader.readUInt8()
    const data = reader.readVarOctetString()
    protocolData.push({
      protocolName,
      contentType,
      data
    })
  }

  return protocolData
}

function writeTransfer (writer, data) {
  writer.writeUInt64(new BigNumber(data.amount))
  writeProtocolData(writer, data.protocolData)
}

function writeError (writer, data) {
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

  writeProtocolData(writer, data.protocolData)
}

function serialize (obj) {
  const contentsWriter = new Writer()
  switch (obj.type) {
    case TYPE_RESPONSE:
    case TYPE_MESSAGE:
      writeProtocolData(contentsWriter, obj.data.protocolData)
      break

    case TYPE_TRANSFER:
      writeTransfer(contentsWriter, obj.data)
      break

    case TYPE_ERROR:
      writeError(contentsWriter, obj.data)
      break

    default:
      throw new Error('Unrecognized type')
  }

  const envelopeWriter = new Writer()
  envelopeWriter.writeUInt8(obj.type)
  envelopeWriter.writeUInt32(obj.requestId)
  envelopeWriter.writeVarOctetString(contentsWriter.getBuffer())
  return envelopeWriter.getBuffer()
}

function readTransfer (reader) {
  const amount = reader.readUInt64BigNum().toString(10)
  const protocolData = readProtocolData(reader)
  return { amount, protocolData }
}

function readError (reader) {
  const code = reader.read(3).toString('ascii')
  const name = reader.readVarOctetString().toString('ascii')
  const triggeredAt = readGeneralizedTime(reader)
  const data = reader.readVarOctetString().toString('utf8')
  const protocolData = readProtocolData(reader)

  return { code, name, triggeredAt, data, protocolData }
}

function deserialize (buffer) {
  const envelopeReader = Reader.from(buffer)

  const type = +envelopeReader.readUInt8()
  const requestId = +envelopeReader.readUInt32()
  const dataBuff = envelopeReader.readVarOctetString()
  const reader = new Reader(dataBuff)
  let data
  switch (type) {
    case TYPE_RESPONSE:
    case TYPE_MESSAGE:
      data = { protocolData: readProtocolData(reader) }
      break

    case TYPE_TRANSFER:
      data = readTransfer(reader)
      break

    case TYPE_ERROR:
      data = readError(reader)
      break

    default:
      throw new Error('Unrecognized type')
  }

  return { type, requestId, data }
}

module.exports = {
  TYPE_RESPONSE,
  TYPE_ERROR,
  TYPE_MESSAGE,
  TYPE_TRANSFER,

  typeToString,
  base64url,

  MIME_APPLICATION_OCTET_STREAM,
  MIME_TEXT_PLAIN_UTF8,
  MIME_APPLICATION_JSON,

  serialize,
  deserialize,

  // The following functions use an alternative format to access the exposed
  // serialize/deserialize functionality. There is one such serialize* function per BTP call.
  // The arguments passed to them are aligned with the objects defined in the Ledger-Plugin-Interface (LPI),
  // which makes these functions convenient to use when working with LPI objects.
  serializeResponse (requestId, protocolData) {
    return serialize({
      type: TYPE_RESPONSE,
      requestId,
      data: { protocolData }
    })
  },
  serializeError (error, requestId, protocolData) {
    let dataFields
    const { code, name, triggeredAt, data } = error
    dataFields = { code, name, triggeredAt, data, protocolData }
    return serialize({
      type: TYPE_ERROR,
      requestId,
      data: dataFields
    })
  },
  serializeMessage (requestId, protocolData) {
    return serialize({
      type: TYPE_MESSAGE,
      requestId,
      data: { protocolData }
    })
  },
  serializeTransfer (transfer, requestId, protocolData) {
    const { amount } = transfer
    return serialize({
      type: TYPE_TRANSFER,
      requestId,
      data: {
        amount,
        protocolData
      }
    })
  }
}
