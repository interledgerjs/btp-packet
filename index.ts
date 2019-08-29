import { Predictor, Reader, Writer, WriterInterface } from 'oer-utils'
import dateFormat = require('dateformat')

// These constants are increased by 1 for BTP version Alpha
export enum Type {
  TYPE_RESPONSE = 1,
  TYPE_ERROR = 2,
  TYPE_MESSAGE = 6,
  TYPE_TRANSFER = 7
}

export const TYPE_RESPONSE = Type.TYPE_RESPONSE
export const TYPE_ERROR = Type.TYPE_ERROR
export const TYPE_MESSAGE = Type.TYPE_MESSAGE
export const TYPE_TRANSFER = Type.TYPE_TRANSFER

export const MIME_APPLICATION_OCTET_STREAM = 0
export const MIME_TEXT_PLAIN_UTF8 = 1
export const MIME_APPLICATION_JSON = 2

export function typeToString (type: Type) {
  switch (type) {
    case Type.TYPE_RESPONSE: return 'TYPE_RESPONSE'
    case Type.TYPE_ERROR: return 'TYPE_ERROR'
    case Type.TYPE_MESSAGE: return 'TYPE_MESSAGE'
    case Type.TYPE_TRANSFER: return 'TYPE_TRANSFER'
    default: throw new Error('Unrecognized BTP packet type')
  }
}

const GENERALIZED_TIME_REGEX =
  /^([0-9]{4})([0-9]{2})([0-9]{2})([0-9]{2})([0-9]{2})([0-9]{2}\.[0-9]{3}Z)$/

const protocolNameCache: {[s: string]: Buffer} = {}

// Generate a cache of the most commonly used BTP subprotocol names.
// The goal is to avoid an extra buffer allocation when serializing.
registerProtocolNames([
  'ilp',
  // BTP authentication:
  'auth',
  'auth_username',
  'auth_token',
  // ilp-plugin-xrp-asym-{client,server}:
  'channel',
  'channel_signature',
  'claim',
  'fund_channel',
  'info',
  'last_claim'
])

export function registerProtocolNames (names: string[]) {
  // Cache the most common BTP subprotocol names so that a new buffer doesn't need
  // to be allocated each serialize().
  for (const protocolName of names) {
    protocolNameCache[protocolName] = Buffer.from(protocolName, 'ascii')
  }
}

// Notes about variable naming - comparison with asn.1 definition:
//
// The term 'Envelope' here correspond to the
// whole BilateralTransferProtocolPacket, see:
// https://github.com/interledger/rfcs/blob/master/asn1/BilateralTransferProtocol.asn

export function base64url (input: Buffer) {
  return input.toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function toGeneralizedTimeBuffer (date: string) {
  return Buffer.from(dateFormat(date, "UTC:yyyymmddHHMMss.l'Z'"))
}

function readGeneralizedTime (reader: Reader) {
  const generalizedTime = reader.readVarOctetString().toString()
  const date = generalizedTime.replace(
    GENERALIZED_TIME_REGEX,
    '$1-$2-$3T$4:$5:$6')

  return new Date(date)
}

export interface ProtocolData {
  protocolName: string
  contentType: number
  data: Buffer
}

function writeProtocolData (writer: WriterInterface, protocolData: ProtocolData[]) {
  if (!Array.isArray(protocolData)) {
    throw new Error('protocolData must be an array')
  }

  const lengthPrefix = protocolData.length
  const lengthPrefixLengthPrefix = Math.max(1,
    Math.ceil((Math.log(protocolData.length + 1) / Math.log(2)) / 8))

  writer.writeUInt8(lengthPrefixLengthPrefix)
  writer.writeUInt(lengthPrefix, lengthPrefixLengthPrefix)

  for (const p of protocolData) {
    writer.writeVarOctetString(
      protocolNameCache[p.protocolName] ||
      Buffer.from(p.protocolName, 'ascii'))
    writer.writeUInt8(p.contentType)
    writer.writeVarOctetString(p.data)
  }
}

function readProtocolData (reader: Reader) {
  const lengthPrefixPrefix = reader.readUInt8Number()
  const lengthPrefix = reader.readUIntNumber(lengthPrefixPrefix)
  const protocolData = []
  for (let i = 0; i < lengthPrefix; ++i) {
    const protocolName = reader.readVarOctetString().toString('ascii')
    const contentType = reader.readUInt8Number()
    const data = reader.readVarOctetString()
    protocolData.push({
      protocolName,
      contentType,
      data
    })
  }

  return protocolData
}

export interface BtpTransfer {
  amount: string
  protocolData: ProtocolData[]
}

function writeTransfer (writer: WriterInterface, data: BtpTransfer) {
  writer.writeUInt64(data.amount)
  writeProtocolData(writer, data.protocolData)
}

export interface BtpError {
  code: string
  name: string
  triggeredAt: string
  data: string
  protocolData: ProtocolData[]
}

function writeError (writer: WriterInterface, data: BtpError) {
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

export interface BtpMessage {
  protocolData: ProtocolData[]
}

export interface BtpMessagePacket {
  type: Type.TYPE_MESSAGE
  requestId: number
  data: BtpMessage
}

export interface BtpResponsePacket {
  type: Type.TYPE_RESPONSE
  requestId: number
  data: BtpMessage
}

export interface BtpTransferPacket {
  type: Type.TYPE_TRANSFER
  requestId: number
  data: BtpTransfer
}

export interface BtpErrorPacket {
  type: Type.TYPE_ERROR
  requestId: number
  data: BtpError
}

export type BtpPacket = BtpResponsePacket | BtpMessagePacket | BtpTransferPacket | BtpErrorPacket

function writeContents (writer: WriterInterface, obj: BtpPacket) {
  switch (obj.type) {
    case Type.TYPE_RESPONSE:
    case Type.TYPE_MESSAGE:
      writeProtocolData(writer, obj.data.protocolData)
      break
    case Type.TYPE_TRANSFER:
      writeTransfer(writer, obj.data)
      break
    case Type.TYPE_ERROR:
      writeError(writer, obj.data)
      break
    default:
      throw new Error('Unrecognized type')
  }
}

export function serialize (obj: BtpPacket): Buffer {
  const contentsPredictor = new Predictor()
  writeContents(contentsPredictor, obj)
  const envelopeSize = 1 + 4 +
    Predictor.measureVarOctetString(contentsPredictor.length)

  const envelopeWriter = new Writer(envelopeSize)
  envelopeWriter.writeUInt8(obj.type)
  envelopeWriter.writeUInt32(obj.requestId)
  const contentsWriter = envelopeWriter.createVarOctetString(contentsPredictor.length)
  writeContents(contentsWriter, obj)
  return envelopeWriter.getBuffer()
}

function readTransfer (reader: Reader): BtpTransfer {
  const amount = reader.readUInt64()
  const protocolData = readProtocolData(reader)
  return { amount, protocolData }
}

function readError (reader: Reader) {
  const code = reader.read(3).toString('ascii')
  const name = reader.readVarOctetString().toString('ascii')
  const triggeredAt = readGeneralizedTime(reader)
  const data = reader.readVarOctetString().toString('utf8')
  const protocolData = readProtocolData(reader)

  return { code, name, triggeredAt, data, protocolData }
}

export function deserialize (buffer: Buffer) {
  const envelopeReader = Reader.from(buffer)

  const type = envelopeReader.readUInt8Number()
  const requestId = envelopeReader.readUInt32Number()
  const dataBuff = envelopeReader.readVarOctetString()
  const reader = new Reader(dataBuff)
  let data
  switch (type) {
    case Type.TYPE_RESPONSE:
    case Type.TYPE_MESSAGE:
      data = { protocolData: readProtocolData(reader) }
      break

    case Type.TYPE_TRANSFER:
      data = readTransfer(reader)
      break

    case Type.TYPE_ERROR:
      data = readError(reader)
      break

    default:
      throw new Error('Unrecognized type')
  }

  return { type, requestId, data }
}

interface BtpTransferWithoutProtocolData {
  amount: string
}

interface BtpErrorWithoutProtocolData {
  code: string
  name: string
  triggeredAt: string
  data: string
}

// The following functions use an alternative format to access the exposed
// serialize/deserialize functionality. There is one such serialize* function per BTP call.
// The arguments passed to them are aligned with the objects defined in the Ledger-Plugin-Interface (LPI),
// which makes these functions convenient to use when working with LPI objects.
export const serializeResponse = (requestId: number, protocolData: ProtocolData[]) => {
  return serialize({
    type: Type.TYPE_RESPONSE,
    requestId,
    data: { protocolData }
  })
}
export const serializeError = (error: BtpErrorWithoutProtocolData, requestId: number, protocolData: ProtocolData[]) => {
  let dataFields
  const { code, name, triggeredAt, data } = error
  dataFields = { code, name, triggeredAt, data, protocolData }
  return serialize({
    type: Type.TYPE_ERROR,
    requestId,
    data: dataFields
  })
}
export const serializeMessage = (requestId: number, protocolData: ProtocolData[]) => {
  return serialize({
    type: Type.TYPE_MESSAGE,
    requestId,
    data: { protocolData }
  })
}
export const serializeTransfer = (transfer: BtpTransferWithoutProtocolData, requestId: number, protocolData: ProtocolData[]) => {
  const { amount } = transfer
  return serialize({
    type: Type.TYPE_TRANSFER,
    requestId,
    data: {
      amount,
      protocolData
    }
  })
}
