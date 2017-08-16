const Clp = require('..')
const assert = require('chai').assert
const IlpPacket = require('ilp-packet')
const uuid = require('uuid')
const crypto = require('crypto')
const base64url = require('base64url')

describe('Common Ledger Protocol', () => {
  beforeEach(function () {
    this.ilpPacket = IlpPacket.serializeIlpPayment({
      account: 'example.red.alice',
      amount: '100'
    })

    this.protocolData = [
      { name: 'ilp', contentType: Clp.MIME_APPLICATION_OCTET_STREAM, data: this.ilpPacket },
      { name: 'foo', contentType: Clp.MIME_APPLICATION_OCTET_STREAM, data: Buffer.from('bar') },
      { name: 'beep', contentType: Clp.MIME_TEXT_PLAIN_UTF8, data: Buffer.from('boop') },
      { name: 'json', contentType: Clp.MIME_APPLICATION_JSON, data: Buffer.from('{}') }
    ]

    this.transfer = {
      id: uuid(),
      amount: '1000',
      executionCondition: base64url(crypto.randomBytes(32)),
      expiresAt: new Date()
    }

    this.fulfill = {
      id: uuid(),
      fulfillment: base64url(crypto.randomBytes(32))
    }

    this.reject = {
      id: uuid(),
      reason: this.ilpPacket.toString('base64')
    }

    this.error = {
      ilp: this.ilpPacket.toString('base64')
    }
  })

  describe('Ack', () => {
    it('should serialize/deserialize without losing data', function () {
      const buf = Clp.serializeAck(1, this.protocolData)
      const res = Clp.deserializeAck(buf)

      assert.deepEqual(res, {
        requestId: 1,
        protocolData: this.protocolData
      })
    })
  })

  describe('Response', () => {
    it('should serialize/deserialize without losing data', function () {
      const buf = Clp.serializeResponse(1, this.protocolData)
      const res = Clp.deserializeResponse(buf)

      assert.deepEqual(res, {
        requestId: 1,
        protocolData: this.protocolData
      })
    })
  })

  describe('Error', () => {
    it('should serialize/deserialize without losing data', function () {
      const buf = Clp.serializeError(this.error, 1, this.protocolData)
      const res = Clp.deserializeError(buf)

      assert.deepEqual(res, Object.assign({
        requestId: 1,
        protocolData: this.protocolData
      }, this.error))
    })
  })

  describe('Prepare', () => {
    it('should serialize/deserialize without losing data', function () {
      const buf = Clp.serializePrepare(this.transfer, 1, this.protocolData)
      const res = Clp.deserializePrepare(buf)

      assert.deepEqual(res, Object.assign({
        requestId: 1,
        protocolData: this.protocolData
      }, this.transfer))
    })

    it('should serialize/deserialize 64-bit amount without losing precision', function () {
      this.transfer.amount = '1234567890123'

      const buf = Clp.serializePrepare(this.transfer, 1, this.protocolData)
      const res = Clp.deserializePrepare(buf)

      assert.deepEqual(res, Object.assign({
        requestId: 1,
        protocolData: this.protocolData
      }, this.transfer))
    })
  })

  describe('Fufill', () => {
    it('should serialize/deserialize without losing data', function () {
      const buf = Clp.serializeFulfill(this.fulfill, 1, this.protocolData)
      const res = Clp.deserializeFulfill(buf)

      assert.deepEqual(res, Object.assign({
        requestId: 1,
        protocolData: this.protocolData
      }, this.fulfill))
    })
  })

  describe('Reject', () => {
    it('should serialize/deserialize without losing data', function () {
      const buf = Clp.serializeReject(this.reject, 1, this.protocolData)
      const res = Clp.deserializeReject(buf)

      assert.deepEqual(res, Object.assign({
        requestId: 1,
        protocolData: this.protocolData
      }, this.reject))
    })
  })

  describe('Message', () => {
    it('should serialize/deserialize without losing data', function () {
      const buf = Clp.serializeMessage(1, this.protocolData)
      const res = Clp.deserializeMessage(buf)

      assert.deepEqual(res, {
        requestId: 1,
        protocolData: this.protocolData
      })
    })
  })
})
