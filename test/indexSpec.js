const Clp = require('..')
const assert = require('chai').assert
const IlpPacket = require('ilp-packet')
const uuid = require('uuid')
const crypto = require('crypto')
const base64url = require('base64url')

describe('Common Ledger Protocol', () => {
  beforeEach(function () {
    this.sideData = {
      'foo': Buffer.from('bar'),
      'beep': Buffer.from('boop')
    }

    this.ilpPacket = IlpPacket.serializeIlpPayment({
      account: 'example.red.alice',
      amount: '100'
    }).toString('base64')

    this.transfer = {
      id: uuid(),
      amount: '1000',
      executionCondition: base64url(crypto.randomBytes(32)),
      expiresAt: new Date(),
      ilp: this.ilpPacket
    }

    this.fulfill = {
      id: uuid(),
      fulfillment: base64url(crypto.randomBytes(32))
    }

    this.reject = {
      id: uuid(),
      reason: this.ilpPacket
    }
  })

  describe('Ack', () => {
    it('should serialize/deserialize without losing data', function () {
      const buf = Clp.serializeAck(1, this.sideData)
      const res = Clp.deserializeAck(buf)

      assert.deepEqual(res, {
        requestId: 1,
        sideData: this.sideData
      })
    })
  })

  describe('Response', () => {
    it('should serialize/deserialize without losing data', function () {
      const buf = Clp.serializeResponse({ ilp: this.ilpPacket }, 1, this.sideData)
      const res = Clp.deserializeResponse(buf)

      assert.deepEqual(res, {
        requestId: 1,
        ilp: this.ilpPacket,
        sideData: this.sideData
      })
    })
  })

  describe('CustomResponse', () => {
    it('should serialize/deserialize without losing data', function () {
      const buf = Clp.serializeCustomResponse(1, this.sideData)
      const res = Clp.deserializeCustomResponse(buf)

      assert.deepEqual(res, {
        requestId: 1,
        sideData: this.sideData
      })
    })
  })

  describe('Prepare', () => {
    it('should serialize/deserialize without losing data', function () {
      const buf = Clp.serializePrepare(this.transfer, 1, this.sideData)
      const res = Clp.deserializePrepare(buf)

      assert.deepEqual(res, Object.assign({
        requestId: 1,
        sideData: this.sideData
      }, this.transfer))
    })

    it('should serialize/deserialize 64-bit amount without losing precision', function () {
      this.transfer.amount = '1234567890123'

      const buf = Clp.serializePrepare(this.transfer, 1, this.sideData)
      const res = Clp.deserializePrepare(buf)

      assert.deepEqual(res, Object.assign({
        requestId: 1,
        sideData: this.sideData
      }, this.transfer))
    })
  })

  describe('Fufill', () => {
    it('should serialize/deserialize without losing data', function () {
      const buf = Clp.serializeFulfill(this.fulfill, 1, this.sideData)
      const res = Clp.deserializeFulfill(buf)

      assert.deepEqual(res, Object.assign({
        requestId: 1,
        sideData: this.sideData
      }, this.fulfill))
    })
  })

  describe('Reject', () => {
    it('should serialize/deserialize without losing data', function () {
      const buf = Clp.serializeReject(this.reject, 1, this.sideData)
      const res = Clp.deserializeReject(buf)

      assert.deepEqual(res, Object.assign({
        requestId: 1,
        sideData: this.sideData
      }, this.reject))
    })
  })

  describe('Message', () => {
    it('should serialize/deserialize without losing data', function () {
      const buf = Clp.serializeMessage({ ilp: this.ilpPacket }, 1, this.sideData)
      const res = Clp.deserializeMessage(buf)

      assert.deepEqual(res, {
        requestId: 1,
        ilp: this.ilpPacket,
        sideData: this.sideData
      })
    })
  })

  describe('CustomRequest', () => {
    it('should serialize/deserialize without losing data', function () {
      const buf = Clp.serializeCustomRequest(1, this.sideData)
      const res = Clp.deserializeCustomRequest(buf)

      assert.deepEqual(res, {
        requestId: 1,
        sideData: this.sideData
      })
    })
  })
})
