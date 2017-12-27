'use strict'

const Btp = require('..')
const assert = require('chai').assert
const IlpPacket = require('ilp-packet')
const base64url = require('base64url')

describe('BTP/1.0', () => {
  beforeEach(function () {
    this.ilpPacket = IlpPacket.serializeIlpPayment({
      account: 'example.red.alice',
      amount: '100'
    })

    this.protocolData = [
      { protocolName: 'ilp', contentType: Btp.MIME_APPLICATION_OCTET_STREAM, data: this.ilpPacket },
      { protocolName: 'foo', contentType: Btp.MIME_APPLICATION_OCTET_STREAM, data: Buffer.from('bar') },
      { protocolName: 'beep', contentType: Btp.MIME_TEXT_PLAIN_UTF8, data: Buffer.from('boop') },
      { protocolName: 'json', contentType: Btp.MIME_APPLICATION_JSON, data: Buffer.from('{}') }
    ]

    this.transfer = {
      transferId: 'b4c838f6-80b1-47f8-a82e-b1fcfbed89d5',
      amount: '1000',
      executionCondition: base64url(Buffer.from([219, 42, 249, 249, 219, 166, 255, 52, 179, 237, 173, 251, 152, 107, 155, 180, 205, 75, 75, 65, 229, 4, 65, 25, 197, 93, 52, 175, 218, 191, 252, 2])),
      expiresAt: new Date('2017-08-28T09:32:00.000Z')
    }

    this.fulfill = {
      transferId: this.transfer.transferId,
      fulfillment: base64url(Buffer.from([219, 42, 249, 249, 219, 166, 255, 52, 179, 237, 173, 251, 152, 107, 155, 180, 205, 75, 75, 65, 229, 4, 65, 25, 197, 93, 52, 175, 218, 191, 252, 2]))
    }

    this.reject = {
      transferId: this.transfer.transferId
    }

    this.btpError = {
      code: 'L13',
      name: 'errorName',
      triggeredAt: new Date('2017-08-28T18:32:00.000Z'),
      data: 'boo',
      protocolData: this.protocolData
    }

    this.error = {
      code: 'L13',
      name: 'errorName',
      triggeredBy: 'peer.',
      forwardedBy: ['die da', 'die da', 'die da'],
      triggeredAt: new Date('2017-08-28T09:32:00.000Z'),
      data: 'boo'
    }
    this.errorBuf = IlpPacket.serializeIlpError(this.error)
    this.errorStr = this.errorBuf.toString('base64')
    this.buffers = {
      response: Buffer.from([1, 0, 0, 0, 1, 67, 1, 4, 3, 105, 108, 112, 0, 30, 1, 28, 0, 0, 0, 0, 0, 0, 0, 100, 17, 101, 120, 97, 109, 112, 108, 101, 46, 114, 101, 100, 46, 97, 108, 105, 99, 101, 0, 0, 3, 102, 111, 111, 0, 3, 98, 97, 114, 4, 98, 101, 101, 112, 1, 4, 98, 111, 111, 112, 4, 106, 115, 111, 110, 2, 2, 123, 125]),
      error: Buffer.from([2, 0, 0, 0, 1, 104, 76, 49, 51, 9, 101, 114, 114, 111, 114, 78, 97, 109, 101, 19, 50, 48, 49, 55, 48, 56, 50, 56, 49, 56, 51, 50, 48, 48, 46, 48, 48, 48, 90, 3, 98, 111, 111, 1, 4, 3, 105, 108, 112, 0, 30, 1, 28, 0, 0, 0, 0, 0, 0, 0, 100, 17, 101, 120, 97, 109, 112, 108, 101, 46, 114, 101, 100, 46, 97, 108, 105, 99, 101, 0, 0, 3, 102, 111, 111, 0, 3, 98, 97, 114, 4, 98, 101, 101, 112, 1, 4, 98, 111, 111, 112, 4, 106, 115, 111, 110, 2, 2, 123, 125]),
      prepare1: Buffer.from([3, 0, 0, 0, 1, 129, 143, 180, 200, 56, 246, 128, 177, 71, 248, 168, 46, 177, 252, 251, 237, 137, 213, 0, 0, 0, 0, 0, 0, 3, 232, 219, 42, 249, 249, 219, 166, 255, 52, 179, 237, 173, 251, 152, 107, 155, 180, 205, 75, 75, 65, 229, 4, 65, 25, 197, 93, 52, 175, 218, 191, 252, 2, 19, 50, 48, 49, 55, 48, 56, 50, 56, 48, 57, 51, 50, 48, 48, 46, 48, 48, 48, 90, 1, 4, 3, 105, 108, 112, 0, 30, 1, 28, 0, 0, 0, 0, 0, 0, 0, 100, 17, 101, 120, 97, 109, 112, 108, 101, 46, 114, 101, 100, 46, 97, 108, 105, 99, 101, 0, 0, 3, 102, 111, 111, 0, 3, 98, 97, 114, 4, 98, 101, 101, 112, 1, 4, 98, 111, 111, 112, 4, 106, 115, 111, 110, 2, 2, 123, 125]),
      prepare2: Buffer.from([3, 0, 0, 0, 1, 129, 143, 180, 200, 56, 246, 128, 177, 71, 248, 168, 46, 177, 252, 251, 237, 137, 213, 0, 0, 1, 31, 113, 251, 4, 203, 219, 42, 249, 249, 219, 166, 255, 52, 179, 237, 173, 251, 152, 107, 155, 180, 205, 75, 75, 65, 229, 4, 65, 25, 197, 93, 52, 175, 218, 191, 252, 2, 19, 50, 48, 49, 55, 48, 56, 50, 56, 48, 57, 51, 50, 48, 48, 46, 48, 48, 48, 90, 1, 4, 3, 105, 108, 112, 0, 30, 1, 28, 0, 0, 0, 0, 0, 0, 0, 100, 17, 101, 120, 97, 109, 112, 108, 101, 46, 114, 101, 100, 46, 97, 108, 105, 99, 101, 0, 0, 3, 102, 111, 111, 0, 3, 98, 97, 114, 4, 98, 101, 101, 112, 1, 4, 98, 111, 111, 112, 4, 106, 115, 111, 110, 2, 2, 123, 125]),
      fulfill: Buffer.from([4, 0, 0, 0, 1, 115, 180, 200, 56, 246, 128, 177, 71, 248, 168, 46, 177, 252, 251, 237, 137, 213, 219, 42, 249, 249, 219, 166, 255, 52, 179, 237, 173, 251, 152, 107, 155, 180, 205, 75, 75, 65, 229, 4, 65, 25, 197, 93, 52, 175, 218, 191, 252, 2, 1, 4, 3, 105, 108, 112, 0, 30, 1, 28, 0, 0, 0, 0, 0, 0, 0, 100, 17, 101, 120, 97, 109, 112, 108, 101, 46, 114, 101, 100, 46, 97, 108, 105, 99, 101, 0, 0, 3, 102, 111, 111, 0, 3, 98, 97, 114, 4, 98, 101, 101, 112, 1, 4, 98, 111, 111, 112, 4, 106, 115, 111, 110, 2, 2, 123, 125]),
      reject: Buffer.from([5, 0, 0, 0, 1, 83, 180, 200, 56, 246, 128, 177, 71, 248, 168, 46, 177, 252, 251, 237, 137, 213, 1, 4, 3, 105, 108, 112, 0, 30, 1, 28, 0, 0, 0, 0, 0, 0, 0, 100, 17, 101, 120, 97, 109, 112, 108, 101, 46, 114, 101, 100, 46, 97, 108, 105, 99, 101, 0, 0, 3, 102, 111, 111, 0, 3, 98, 97, 114, 4, 98, 101, 101, 112, 1, 4, 98, 111, 111, 112, 4, 106, 115, 111, 110, 2, 2, 123, 125]),
      message: Buffer.from([6, 0, 0, 0, 1, 67, 1, 4, 3, 105, 108, 112, 0, 30, 1, 28, 0, 0, 0, 0, 0, 0, 0, 100, 17, 101, 120, 97, 109, 112, 108, 101, 46, 114, 101, 100, 46, 97, 108, 105, 99, 101, 0, 0, 3, 102, 111, 111, 0, 3, 98, 97, 114, 4, 98, 101, 101, 112, 1, 4, 98, 111, 111, 112, 4, 106, 115, 111, 110, 2, 2, 123, 125]),
      transfer: Buffer.from([7, 0, 0, 0, 1, 75, 0, 0, 0, 0, 0, 0, 0, 100, 1, 4, 3, 105, 108, 112, 0, 30, 1, 28, 0, 0, 0, 0, 0, 0, 0, 100, 17, 101, 120, 97, 109, 112, 108, 101, 46, 114, 101, 100, 46, 97, 108, 105, 99, 101, 0, 0, 3, 102, 111, 111, 0, 3, 98, 97, 114, 4, 98, 101, 101, 112, 1, 4, 98, 111, 111, 112, 4, 106, 115, 111, 110, 2, 2, 123, 125])
    }
  })

  describe('Response', () => {
    it('should serialize/deserialize without losing data', function () {
      const obj = {
        type: Btp.TYPE_RESPONSE,
        requestId: 1,
        data: {
          protocolData: this.protocolData
        }
      }
      assert.deepEqual(Btp.serialize(obj), this.buffers.response)
      assert.deepEqual(Btp.deserialize(this.buffers.response), obj)
    })
  })

  describe('Error', () => {
    it('should serialize/deserialize without losing data', function () {
      const obj = {
        type: Btp.TYPE_ERROR,
        requestId: 1,
        data: this.btpError
      }
      assert.deepEqual(Btp.serialize(obj), this.buffers.error)
      assert.deepEqual(Btp.deserialize(this.buffers.error), obj)
    })
  })

  describe('Prepare', () => {
    it('should serialize/deserialize without losing data', function () {
      const obj = {
        type: Btp.TYPE_PREPARE,
        requestId: 1,
        data: {
          protocolData: this.protocolData,
          transferId: this.transfer.transferId,
          amount: this.transfer.amount,
          expiresAt: this.transfer.expiresAt,
          executionCondition: this.transfer.executionCondition
        }
      }
      assert.deepEqual(Btp.serialize(obj), this.buffers.prepare1)
      assert.deepEqual(Btp.deserialize(this.buffers.prepare1), obj)
    })

    it('should serialize/deserialize 64-bit amount without losing precision', function () {
      const obj = {
        type: Btp.TYPE_PREPARE,
        requestId: 1,
        data: {
          protocolData: this.protocolData,
          transferId: this.transfer.transferId,
          amount: '1234567890123',
          expiresAt: this.transfer.expiresAt,
          executionCondition: this.transfer.executionCondition
        }
      }
      assert.deepEqual(Btp.serialize(obj), this.buffers.prepare2)
      assert.deepEqual(Btp.deserialize(this.buffers.prepare2), obj)
    })
  })

  describe('Fulfill', () => {
    it('should serialize/deserialize without losing data', function () {
      const obj = {
        type: Btp.TYPE_FULFILL,
        requestId: 1,
        data: {
          protocolData: this.protocolData,
          transferId: this.fulfill.transferId,
          fulfillment: this.fulfill.fulfillment
        }
      }
      assert.deepEqual(Btp.serialize(obj), this.buffers.fulfill)
      assert.deepEqual(Btp.deserialize(this.buffers.fulfill), obj)
    })
  })

  describe('Reject', () => {
    it('should serialize/deserialize without losing data', function () {
      const obj = {
        type: Btp.TYPE_REJECT,
        requestId: 1,
        data: {
          protocolData: this.protocolData,
          transferId: this.fulfill.transferId
        }
      }
      assert.deepEqual(Btp.serialize(obj), this.buffers.reject)
      assert.deepEqual(Btp.deserialize(this.buffers.reject), obj)
    })
  })

  describe('Message', () => {
    it('should serialize/deserialize without losing data', function () {
      const obj = {
        type: Btp.TYPE_MESSAGE,
        requestId: 1,
        data: {
          protocolData: this.protocolData
        }
      }
      assert.deepEqual(Btp.serialize(obj), this.buffers.message)
      assert.deepEqual(Btp.deserialize(this.buffers.message), obj)
    })
  })

  describe('Transfer', () => {
    it('should serialize/deserialize without losing data', function () {
      const obj = {
        type: Btp.TYPE_TRANSFER,
        requestId: 1,
        data: {
          amount: '100',
          protocolData: this.protocolData
        }
      }
      assert.deepEqual(Btp.serialize(obj), this.buffers.transfer)
      assert.deepEqual(Btp.deserialize(this.buffers.transfer), obj)
    })
  })

  describe('serializeResponse', () => {
    it('should serialize without losing data', function () {
      const buf = Btp.serializeResponse(1, this.protocolData)
      assert.deepEqual(buf, this.buffers.response)
    })
  })

  describe('serializeError', () => {
    it('should serialize without losing data', function () {
      const buf = Btp.serializeError(this.btpError, 1, this.protocolData)
      assert.deepEqual(buf, this.buffers.error)
    })
  })

  describe('serializePrepare', () => {
    it('should serialize without losing data', function () {
      const buf = Btp.serializePrepare(this.transfer, 1, this.protocolData)
      assert.deepEqual(buf, this.buffers.prepare1)
    })

    it('should serialize 64-bit amount without losing precision', function () {
      this.transfer.amount = '1234567890123'

      const buf = Btp.serializePrepare(this.transfer, 1, this.protocolData)
      assert.deepEqual(buf, this.buffers.prepare2)
    })
  })

  describe('serializeFulfill', () => {
    it('should serialize without losing data', function () {
      const buf = Btp.serializeFulfill(this.fulfill, 1, this.protocolData)
      assert.deepEqual(buf, this.buffers.fulfill)
    })
  })

  describe('serializeReject', () => {
    it('should serialize without losing data', function () {
      const buf = Btp.serializeReject(this.reject, 1, this.protocolData)
      assert.deepEqual(buf, this.buffers.reject)
    })
  })

  describe('serializeMessage', () => {
    it('should serialize without losing data', function () {
      const buf = Btp.serializeMessage(1, this.protocolData)
      assert.deepEqual(buf, this.buffers.message)
    })
  })

  describe('serializeTransfer', () => {
    it('should serialize without losing data', function () {
      const buf = Btp.serializeTransfer({ amount: 100 }, 1, this.protocolData)
      assert.deepEqual(buf, this.buffers.transfer)
    })
  })
})
