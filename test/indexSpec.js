'use strict'

const Clp = require('..')
const assert = require('chai').assert
const IlpPacket = require('ilp-packet')

describe('Common Ledger Protocol', () => {
  beforeEach(function () {
    this.ilpPacket = IlpPacket.serializeIlpPayment({
      account: 'example.red.alice',
      amount: '100'
    })

    this.protocolData = [
      { protocolName: 'ilp', contentType: Clp.MIME_APPLICATION_OCTET_STREAM, data: this.ilpPacket },
      { protocolName: 'foo', contentType: Clp.MIME_APPLICATION_OCTET_STREAM, data: Buffer.from('bar') },
      { protocolName: 'beep', contentType: Clp.MIME_TEXT_PLAIN_UTF8, data: Buffer.from('boop') },
      { protocolName: 'json', contentType: Clp.MIME_APPLICATION_JSON, data: Buffer.from('{}') }
    ]

    this.transfer = {
      transferId: 'b4c838f6-80b1-47f8-a82e-b1fcfbed89d5',
      amount: '1000',
      executionCondition: Buffer.from([219, 42, 249, 249, 219, 166, 255, 52, 179, 237, 173, 251, 152, 107, 155, 180, 205, 75, 75, 65, 229, 4, 65, 25, 197, 93, 52, 175, 218, 191, 252, 2]),
      expiresAt: new Date('2017-08-28 11:32')
    }

    this.fulfill = {
      transferId: this.transfer.transferId,
      fulfillment: Buffer.from([219, 42, 249, 249, 219, 166, 255, 52, 179, 237, 173, 251, 152, 107, 155, 180, 205, 75, 75, 65, 229, 4, 65, 25, 197, 93, 52, 175, 218, 191, 252, 2])
    }

    this.reject = {
      transferId: this.transfer.transferId,
      rejectionReason: this.error
    }

    this.rejectBuf = {
      transferId: this.transfer.transferId,
      rejectionReason: this.errorBuf
    }

    this.rejectStr = {
      transferId: this.transfer.transferId,
      rejectionReason: this.errorStr
    }

    this.error = {
      code: 'L13',
      name: 'errorName',
      triggeredBy: 'peer.',
      forwardedBy: ['die da', 'die da', 'die da'],
      triggeredAt: new Date('2017-08-28 11:32'),
      data: 'boo'
    }
    this.errorBuf = IlpPacket.serializeIlpError(this.error)
    this.errorStr = this.errorBuf.toString('base64')
    this.buffers = {
      ack: Buffer.from([1, 0, 0, 0, 1, 67, 1, 4, 3, 105, 108, 112, 0, 30, 1, 28, 0, 0, 0, 0, 0, 0, 0, 100, 17, 101, 120, 97, 109, 112, 108, 101, 46, 114, 101, 100, 46, 97, 108, 105, 99, 101, 0, 0, 3, 102, 111, 111, 0, 3, 98, 97, 114, 4, 98, 101, 101, 112, 1, 4, 98, 111, 111, 112, 4, 106, 115, 111, 110, 2, 2, 123, 125]),
      response: Buffer.from([2, 0, 0, 0, 1, 67, 1, 4, 3, 105, 108, 112, 0, 30, 1, 28, 0, 0, 0, 0, 0, 0, 0, 100, 17, 101, 120, 97, 109, 112, 108, 101, 46, 114, 101, 100, 46, 97, 108, 105, 99, 101, 0, 0, 3, 102, 111, 111, 0, 3, 98, 97, 114, 4, 98, 101, 101, 112, 1, 4, 98, 111, 111, 112, 4, 106, 115, 111, 110, 2, 2, 123, 125]),
      error: Buffer.from([3, 0, 0, 0, 1, 129, 136, 8, 67, 76, 49, 51, 9, 101, 114, 114, 111, 114, 78, 97, 109, 101, 5, 112, 101, 101, 114, 46, 1, 3, 6, 100, 105, 101, 32, 100, 97, 6, 100, 105, 101, 32, 100, 97, 6, 100, 105, 101, 32, 100, 97, 19, 50, 48, 49, 55, 48, 56, 50, 56, 48, 57, 51, 50, 48, 48, 46, 48, 48, 48, 90, 3, 98, 111, 111, 0, 1, 4, 3, 105, 108, 112, 0, 30, 1, 28, 0, 0, 0, 0, 0, 0, 0, 100, 17, 101, 120, 97, 109, 112, 108, 101, 46, 114, 101, 100, 46, 97, 108, 105, 99, 101, 0, 0, 3, 102, 111, 111, 0, 3, 98, 97, 114, 4, 98, 101, 101, 112, 1, 4, 98, 111, 111, 112, 4, 106, 115, 111, 110, 2, 2, 123, 125]),
      prepare1: Buffer.from([4, 0, 0, 0, 1, 129, 143, 180, 200, 56, 246, 128, 177, 71, 248, 168, 46, 177, 252, 251, 237, 137, 213, 0, 0, 0, 0, 0, 0, 3, 232, 219, 42, 249, 249, 219, 166, 255, 52, 179, 237, 173, 251, 152, 107, 155, 180, 205, 75, 75, 65, 229, 4, 65, 25, 197, 93, 52, 175, 218, 191, 252, 2, 19, 50, 48, 49, 55, 48, 56, 50, 56, 48, 57, 51, 50, 48, 48, 46, 48, 48, 48, 90, 1, 4, 3, 105, 108, 112, 0, 30, 1, 28, 0, 0, 0, 0, 0, 0, 0, 100, 17, 101, 120, 97, 109, 112, 108, 101, 46, 114, 101, 100, 46, 97, 108, 105, 99, 101, 0, 0, 3, 102, 111, 111, 0, 3, 98, 97, 114, 4, 98, 101, 101, 112, 1, 4, 98, 111, 111, 112, 4, 106, 115, 111, 110, 2, 2, 123, 125]),
      prepare2: Buffer.from([4, 0, 0, 0, 1, 129, 143, 180, 200, 56, 246, 128, 177, 71, 248, 168, 46, 177, 252, 251, 237, 137, 213, 0, 0, 1, 31, 113, 251, 4, 203, 219, 42, 249, 249, 219, 166, 255, 52, 179, 237, 173, 251, 152, 107, 155, 180, 205, 75, 75, 65, 229, 4, 65, 25, 197, 93, 52, 175, 218, 191, 252, 2, 19, 50, 48, 49, 55, 48, 56, 50, 56, 48, 57, 51, 50, 48, 48, 46, 48, 48, 48, 90, 1, 4, 3, 105, 108, 112, 0, 30, 1, 28, 0, 0, 0, 0, 0, 0, 0, 100, 17, 101, 120, 97, 109, 112, 108, 101, 46, 114, 101, 100, 46, 97, 108, 105, 99, 101, 0, 0, 3, 102, 111, 111, 0, 3, 98, 97, 114, 4, 98, 101, 101, 112, 1, 4, 98, 111, 111, 112, 4, 106, 115, 111, 110, 2, 2, 123, 125]),
      fulfill: Buffer.from([5, 0, 0, 0, 1, 115, 180, 200, 56, 246, 128, 177, 71, 248, 168, 46, 177, 252, 251, 237, 137, 213, 219, 42, 249, 249, 219, 166, 255, 52, 179, 237, 173, 251, 152, 107, 155, 180, 205, 75, 75, 65, 229, 4, 65, 25, 197, 93, 52, 175, 218, 191, 252, 2, 1, 4, 3, 105, 108, 112, 0, 30, 1, 28, 0, 0, 0, 0, 0, 0, 0, 100, 17, 101, 120, 97, 109, 112, 108, 101, 46, 114, 101, 100, 46, 97, 108, 105, 99, 101, 0, 0, 3, 102, 111, 111, 0, 3, 98, 97, 114, 4, 98, 101, 101, 112, 1, 4, 98, 111, 111, 112, 4, 106, 115, 111, 110, 2, 2, 123, 125]),
      reject: Buffer.from([6, 0, 0, 0, 1, 129, 152, 180, 200, 56, 246, 128, 177, 71, 248, 168, 46, 177, 252, 251, 237, 137, 213, 8, 67, 76, 49, 51, 9, 101, 114, 114, 111, 114, 78, 97, 109, 101, 5, 112, 101, 101, 114, 46, 1, 3, 6, 100, 105, 101, 32, 100, 97, 6, 100, 105, 101, 32, 100, 97, 6, 100, 105, 101, 32, 100, 97, 19, 50, 48, 49, 55, 48, 56, 50, 56, 48, 57, 51, 50, 48, 48, 46, 48, 48, 48, 90, 3, 98, 111, 111, 0, 1, 4, 3, 105, 108, 112, 0, 30, 1, 28, 0, 0, 0, 0, 0, 0, 0, 100, 17, 101, 120, 97, 109, 112, 108, 101, 46, 114, 101, 100, 46, 97, 108, 105, 99, 101, 0, 0, 3, 102, 111, 111, 0, 3, 98, 97, 114, 4, 98, 101, 101, 112, 1, 4, 98, 111, 111, 112, 4, 106, 115, 111, 110, 2, 2, 123, 125]),
      message: Buffer.from([7, 0, 0, 0, 1, 67, 1, 4, 3, 105, 108, 112, 0, 30, 1, 28, 0, 0, 0, 0, 0, 0, 0, 100, 17, 101, 120, 97, 109, 112, 108, 101, 46, 114, 101, 100, 46, 97, 108, 105, 99, 101, 0, 0, 3, 102, 111, 111, 0, 3, 98, 97, 114, 4, 98, 101, 101, 112, 1, 4, 98, 111, 111, 112, 4, 106, 115, 111, 110, 2, 2, 123, 125])
    }
  })

  describe('Ack', () => {
    it('should serialize/deserialize without losing data', function () {
      const obj = {
        type: Clp.TYPE_ACK,
        requestId: 1,
        data: this.protocolData // see https://github.com/interledger/rfcs/issues/284
      }
      assert.deepEqual(Clp.serialize(obj), this.buffers.ack)
      assert.deepEqual(Clp.deserialize(this.buffers.ack), obj)
    })
  })

  describe('Response', () => {
    it('should serialize/deserialize without losing data', function () {
      const obj = {
        type: Clp.TYPE_RESPONSE,
        requestId: 1,
        data: this.protocolData // see https://github.com/interledger/rfcs/issues/284
      }
      assert.deepEqual(Clp.serialize(obj), this.buffers.response)
      assert.deepEqual(Clp.deserialize(this.buffers.response), obj)
    })
  })

  describe('Error', () => {
    it('should serialize/deserialize without losing data', function () {
      const obj = {
        type: Clp.TYPE_ERROR,
        requestId: 1,
        data: {
          protocolData: this.protocolData,
          rejectionReason: this.error
        }
      }
      assert.deepEqual(Clp.serialize(obj), this.buffers.error)
      assert.deepEqual(Clp.deserialize(this.buffers.error), obj)
    })

    it('should serialize from buffer without losing data', function () {
      const objWithBuf = {
        type: Clp.TYPE_ERROR,
        requestId: 1,
        data: {
          protocolData: this.protocolData,
          rejectionReason: this.errorBuf
        }
      }
      assert.deepEqual(Clp.serialize(objWithBuf), this.buffers.error)
    })

    it('should serialize from string without losing data', function () {
      const objWithStr = {
        type: Clp.TYPE_ERROR,
        requestId: 1,
        data: {
          protocolData: this.protocolData,
          rejectionReason: this.errorStr
        }
      }
      assert.deepEqual(Clp.serialize(objWithStr), this.buffers.error)
    })
  })

  describe('Prepare', () => {
    it('should serialize/deserialize without losing data', function () {
      const obj = {
        type: Clp.TYPE_PREPARE,
        requestId: 1,
        data: {
          protocolData: this.protocolData,
          transferId: this.transfer.transferId,
          amount: this.transfer.amount,
          expiresAt: this.transfer.expiresAt,
          executionCondition: this.transfer.executionCondition
        }
      }
      assert.deepEqual(Clp.serialize(obj), this.buffers.prepare1)
      assert.deepEqual(Clp.deserialize(this.buffers.prepare1), obj)
    })

    it('should serialize/deserialize 64-bit amount without losing precision', function () {
      const obj = {
        type: Clp.TYPE_PREPARE,
        requestId: 1,
        data: {
          protocolData: this.protocolData,
          transferId: this.transfer.transferId,
          amount: '1234567890123',
          expiresAt: this.transfer.expiresAt,
          executionCondition: this.transfer.executionCondition
        }
      }
      assert.deepEqual(Clp.serialize(obj), this.buffers.prepare2)
      assert.deepEqual(Clp.deserialize(this.buffers.prepare2), obj)
    })
  })

  describe('Fulfill', () => {
    it('should serialize/deserialize without losing data', function () {
      const obj = {
        type: Clp.TYPE_FULFILL,
        requestId: 1,
        data: {
          protocolData: this.protocolData,
          transferId: this.fulfill.transferId,
          fulfillment: this.fulfill.fulfillment
        }
      }
      assert.deepEqual(Clp.serialize(obj), this.buffers.fulfill)
      assert.deepEqual(Clp.deserialize(this.buffers.fulfill), obj)
    })
  })

  describe('Reject', () => {
    it('should serialize/deserialize without losing data', function () {
      const obj = {
        type: Clp.TYPE_REJECT,
        requestId: 1,
        data: {
          protocolData: this.protocolData,
          transferId: this.fulfill.transferId,
          rejectionReason: this.error
        }
      }
      assert.deepEqual(Clp.serialize(obj), this.buffers.reject)
      assert.deepEqual(Clp.deserialize(this.buffers.reject), obj)
    })

    it('should serialize from buffer without losing data', function () {
      const objWithBuf = {
        type: Clp.TYPE_REJECT,
        requestId: 1,
        data: {
          protocolData: this.protocolData,
          transferId: this.fulfill.transferId,
          rejectionReason: this.errorBuf
        }
      }
      assert.deepEqual(Clp.serialize(objWithBuf), this.buffers.reject)
    })

    it('should serialize from string without losing data', function () {
      const objWithStr = {
        type: Clp.TYPE_REJECT,
        requestId: 1,
        data: {
          protocolData: this.protocolData,
          transferId: this.fulfill.transferId,
          rejectionReason: this.errorStr
        }
      }
      assert.deepEqual(Clp.serialize(objWithStr), this.buffers.reject)
    })
  })

  describe('Message', () => {
    it('should serialize/deserialize without losing data', function () {
      const obj = {
        type: Clp.TYPE_MESSAGE,
        requestId: 1,
        data: this.protocolData // see https://github.com/interledger/rfcs/issues/284
      }
      assert.deepEqual(Clp.serialize(obj), this.buffers.message)
      assert.deepEqual(Clp.deserialize(this.buffers.message), obj)
    })
  })

  describe('serializeAck (legacy)', () => {
    it('should serialize without losing data', function () {
      const buf = Clp.serializeAck(1, this.protocolData)
      assert.deepEqual(buf, this.buffers.ack)
    })
  })

  describe('serializeResponse (legacy)', () => {
    it('should serialize without losing data', function () {
      const buf = Clp.serializeResponse(1, this.protocolData)
      assert.deepEqual(buf, this.buffers.response)
    })
  })

  describe('serializeError (legacy)', () => {
    it('should serialize without losing data', function () {
      const buf = Clp.serializeError({ rejectionReason: this.error }, 1, this.protocolData)
      assert.deepEqual(buf, this.buffers.error)
    })

    it('should serialize from buffer without losing data', function () {
      const buf = Clp.serializeError({ rejectionReason: this.errorBuf }, 1, this.protocolData)
      assert.deepEqual(buf, this.buffers.error)
    })

    it('should serialize from string without losing data', function () {
      const buf = Clp.serializeError({ rejectionReason: this.errorStr }, 1, this.protocolData)
      assert.deepEqual(buf, this.buffers.error)
    })
  })

  describe('serializePrepare (legacy)', () => {
    it('should serialize without losing data', function () {
      const buf = Clp.serializePrepare(this.transfer, 1, this.protocolData)
      assert.deepEqual(buf, this.buffers.prepare1)
    })

    it('should serialize 64-bit amount without losing precision', function () {
      this.transfer.amount = '1234567890123'

      const buf = Clp.serializePrepare(this.transfer, 1, this.protocolData)
      assert.deepEqual(buf, this.buffers.prepare2)
    })
  })

  describe('serializeFulfill (legacy)', () => {
    it('should serialize without losing data', function () {
      const buf = Clp.serializeFulfill(this.fulfill, 1, this.protocolData)
      assert.deepEqual(buf, this.buffers.fulfill)
    })
  })

  describe('serializeReject (legacy)', () => {
    it('should serialize without losing data', function () {
      const buf = Clp.serializeReject(this.reject, 1, this.protocolData)
      assert.deepEqual(buf, this.buffers.reject)
    })

    it('should serialize from buffer without losing data', function () {
      const buf = Clp.serializeReject(this.rejectBuf, 1, this.protocolData)
      assert.deepEqual(buf, this.buffers.reject)
    })

    it('should serialize from string without losing data', function () {
      const buf = Clp.serializeReject(this.rejectStr, 1, this.protocolData)
      assert.deepEqual(buf, this.buffers.reject)
    })
  })

  describe('serializeMessage (legacy)', () => {
    it('should serialize without losing data', function () {
      const buf = Clp.serializeMessage(1, this.protocolData)
      assert.deepEqual(buf, this.buffers.message)
    })
  })
})
