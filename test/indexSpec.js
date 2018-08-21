'use strict'

const Btp = require('..')
const assert = require('chai').assert

describe('BTP/1.0', () => {
  beforeEach(function () {
    this.protocolData = [
      { protocolName: 'ilp', contentType: Btp.MIME_APPLICATION_OCTET_STREAM, data: Buffer.from([]) },
      { protocolName: 'foo', contentType: Btp.MIME_APPLICATION_OCTET_STREAM, data: Buffer.from('bar') },
      { protocolName: 'beep', contentType: Btp.MIME_TEXT_PLAIN_UTF8, data: Buffer.from('boop') },
      { protocolName: 'json', contentType: Btp.MIME_APPLICATION_JSON, data: Buffer.from('{}') }
    ]

    this.transfer = {
      transferId: 'b4c838f6-80b1-47f8-a82e-b1fcfbed89d5',
      amount: '1000',
      executionCondition: Btp.base64url(Buffer.from([219, 42, 249, 249, 219, 166, 255, 52, 179, 237, 173, 251, 152, 107, 155, 180, 205, 75, 75, 65, 229, 4, 65, 25, 197, 93, 52, 175, 218, 191, 252, 2])),
      expiresAt: new Date('2017-08-28T09:32:00.000Z')
    }

    this.btpError = {
      code: 'L13',
      name: 'errorName',
      triggeredAt: new Date('2017-08-28T18:32:00.000Z'),
      data: 'boo',
      protocolData: this.protocolData
    }

    this.buffers = {
      response: Buffer.from([1, 0, 0, 0, 1, 37, 1, 4, 3, 105, 108, 112, 0, 0, 3, 102, 111, 111, 0, 3, 98, 97, 114, 4, 98, 101, 101, 112, 1, 4, 98, 111, 111, 112, 4, 106, 115, 111, 110, 2, 2, 123, 125]),
      error: Buffer.from([2, 0, 0, 0, 1, 74, 76, 49, 51, 9, 101, 114, 114, 111, 114, 78, 97, 109, 101, 19, 50, 48, 49, 55, 48, 56, 50, 56, 49, 56, 51, 50, 48, 48, 46, 48, 48, 48, 90, 3, 98, 111, 111, 1, 4, 3, 105, 108, 112, 0, 0, 3, 102, 111, 111, 0, 3, 98, 97, 114, 4, 98, 101, 101, 112, 1, 4, 98, 111, 111, 112, 4, 106, 115, 111, 110, 2, 2, 123, 125]),
      message: Buffer.from([6, 0, 0, 0, 1, 37, 1, 4, 3, 105, 108, 112, 0, 0, 3, 102, 111, 111, 0, 3, 98, 97, 114, 4, 98, 101, 101, 112, 1, 4, 98, 111, 111, 112, 4, 106, 115, 111, 110, 2, 2, 123, 125]),
      transfer: Buffer.from([7, 0, 0, 0, 1, 45, 0, 0, 0, 0, 0, 0, 0, 100, 1, 4, 3, 105, 108, 112, 0, 0, 3, 102, 111, 111, 0, 3, 98, 97, 114, 4, 98, 101, 101, 112, 1, 4, 98, 111, 111, 112, 4, 106, 115, 111, 110, 2, 2, 123, 125])
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
