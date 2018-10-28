import {Reader, Writer} from 'oer-utils'
import * as assert from 'assert'
const dateFormat = require('dateformat')
import BigNumber from 'bignumber.js'

// These constants are increased by 1 for BTP version Alpha
export enum Type {
    TYPE_RESPONSE = 1,
    TYPE_ERROR = 2,
    TYPE_MESSAGE = 6,
    TYPE_TRANSFER = 7
}

export enum MimeType {
    MIME_APPLICATION_OCTET_STREAM = 0,
    MIME_TEXT_PLAIN_UTF8 = 1,
    MIME_APPLICATION_JSON = 2
}

export function typeToString(type: number): string {
    switch (type) {
        case Type.TYPE_RESPONSE:
            return 'TYPE_RESPONSE'
        case Type.TYPE_ERROR:
            return 'TYPE_ERROR'
        case Type.TYPE_MESSAGE:
            return 'TYPE_MESSAGE'
        case Type.TYPE_TRANSFER:
            return 'TYPE_TRANSFER'
        default:
            throw new Error('Unrecognized BTP packet type')
    }
}

export interface BtpPacket {
    requestId: number
    type: number
    data: BtpPacketData
}

export interface BtpPacketData {
    protocolData: Array<BtpSubProtocol>
    amount?: string
    code?: string
    name?: string
    triggeredAt?: Date
    data?: string
}

export interface BtpSubProtocol {
    protocolName: string
    contentType: number
    data: Buffer
}

const GENERALIZED_TIME_REGEX =
    /^([0-9]{4})([0-9]{2})([0-9]{2})([0-9]{2})([0-9]{2})([0-9]{2}\.[0-9]{3}Z)$/

// Notes about variable naming - comparison with asn.1 definition:
//
// The term 'Envelope' here correspond to the
// whole BilateralTransferProtocolPacket, see:
// https://github.com/interledger/rfcs/blob/master/asn1/BilateralTransferProtocol.asn

//Todo is this even used anywhere?
export function base64url(input: Buffer): string {
    return input.toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
}

function toGeneralizedTimeBuffer(date: Date): Buffer {
    return Buffer.from(dateFormat(date, "UTC:yyyymmddHHMMss.l'Z'"))
}

function readGeneralizedTime(reader: Reader): Date {
    const generalizedTime = reader.readVarOctetString().toString()
    const date = generalizedTime.replace(
        GENERALIZED_TIME_REGEX,
        '$1-$2-$3T$4:$5:$6')

    return new Date(date)
}

function writeProtocolData(writer: Writer, protocolData: Array<BtpSubProtocol>) {
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

function readProtocolData(reader: Reader): Array<BtpSubProtocol> {
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

function writeTransfer(writer: Writer, data: BtpPacketData) {
    const amount = data.amount as BigNumber.Value
    writer.writeUInt64(new BigNumber(amount))
    writeProtocolData(writer, data.protocolData)
}

function writeError(writer: Writer, data: BtpPacketData) {
    if (data.code && data.code.length !== 3) {
        throw new Error(`error code must be 3 characters, got: "${data.code}"`)
    }

    const codeBuffer = Buffer.from(data.code || 'F00', 'ascii')
    const nameBuffer = Buffer.from(data.name || '', 'ascii')
    const triggeredAtBuffer = toGeneralizedTimeBuffer(data.triggeredAt || new Date())
    const dataBuffer = Buffer.from(data.data || '', 'utf8')

    writer.write(codeBuffer)
    writer.writeVarOctetString(nameBuffer)
    writer.writeVarOctetString(triggeredAtBuffer)
    writer.writeVarOctetString(dataBuffer)

    writeProtocolData(writer, data.protocolData)
}

export function serialize(obj: BtpPacket) : Buffer {
    const contentsWriter = new Writer()
    switch (obj.type) {
        case Type.TYPE_RESPONSE:
        case Type.TYPE_MESSAGE:
            writeProtocolData(contentsWriter, obj.data.protocolData)
            break

        case Type.TYPE_TRANSFER:
            writeTransfer(contentsWriter, obj.data)
            break

        case Type.TYPE_ERROR:
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

function readTransfer(reader: Reader) {
    const amount = reader.readUInt64BigNum().toString(10)
    const protocolData = readProtocolData(reader)
    return {amount, protocolData}
}

function readError(reader: Reader) : BtpPacketData {
    const code = reader.read(3).toString('ascii')
    const name = reader.readVarOctetString().toString('ascii')
    const triggeredAt = readGeneralizedTime(reader)
    const data = reader.readVarOctetString().toString('utf8')
    const protocolData = readProtocolData(reader)

    return {code, name, triggeredAt, data, protocolData}
}

export function deserialize(buffer: Buffer): BtpPacket {
    const envelopeReader = Reader.from(buffer)

    const type = +envelopeReader.readUInt8()
    const requestId = +envelopeReader.readUInt32()
    const dataBuff = envelopeReader.readVarOctetString()
    const reader = new Reader(dataBuff)
    let data
    switch (type) {
        case Type.TYPE_RESPONSE:
        case Type.TYPE_MESSAGE:
            data = {protocolData: readProtocolData(reader)}
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

    return {type, requestId, data}
}


export function serializeResponse(requestId: number, protocolData: Array<BtpSubProtocol>) : Buffer {
    return serialize({
        type: Type.TYPE_RESPONSE,
        requestId,
        data: {
            protocolData
        }
    })
}

export function serializeError(error: BtpPacketData, requestId: number, protocolData: Array<BtpSubProtocol>) : Buffer {
    let dataFields
    const {code, name, triggeredAt, data} = error
    dataFields = {code, name, triggeredAt, data, protocolData}
    return serialize({
        type: Type.TYPE_ERROR,
        requestId,
        data: dataFields
    })
}

export function serializeMessage(requestId: number, protocolData: Array<BtpSubProtocol>) : Buffer {
    return serialize({
        type: Type.TYPE_MESSAGE,
        requestId,
        data: {protocolData}
    })
}

export function serializeTransfer(transfer: BtpPacketData, requestId: number, protocolData: Array<BtpSubProtocol>) : Buffer {
    const {amount} = transfer
    return serialize({
        type: Type.TYPE_TRANSFER,
        requestId,
        data: {
            amount,
            protocolData
        }
    })
}
