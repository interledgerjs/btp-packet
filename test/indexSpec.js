'use strict'

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
      { protocolName: 'ilp', contentType: Clp.MIME_APPLICATION_OCTET_STREAM, data: this.ilpPacket },
      { protocolName: 'foo', contentType: Clp.MIME_APPLICATION_OCTET_STREAM, data: Buffer.from('bar') },
      { protocolName: 'beep', contentType: Clp.MIME_TEXT_PLAIN_UTF8, data: Buffer.from('boop') },
      { protocolName: 'json', contentType: Clp.MIME_APPLICATION_JSON, data: Buffer.from('{}') }
    ]

    this.transfer = {
      transferId: uuid(),
      amount: '1000',
      executionCondition: base64url(crypto.randomBytes(32)),
      expiresAt: new Date()
    }

    this.fulfill = {
      transferId: this.transfer.transferId,
      fulfillment: base64url(crypto.randomBytes(32))
    }

    this.reject = {
      transferId: this.transfer.transferId,
      rejectionReason: this.error
    }

    this.rejectBuf = {
      transferId:  this.transfer.transferId,
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
      triggeredAt: new Date(),
      data: 'boo'
    }
    this.errorBuf = IlpPacket.serializeIlpError(this.error)
    this.errorStr = this.errorBuf.toString('base64')

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
      const buf = Clp.serializeError({ rejectionReason: this.error }, 1, this.protocolData)
      const res = Clp.deserializeError(buf)

      assert.deepEqual(res, {
        requestId: 1,
        rejectionReason: this.error,
        protocolData: this.protocolData
      })
    })

    it('should serialize from buffer without losing data', function () {
      const buf = Clp.serializeError({ rejectionReason: this.errorBuf }, 1, this.protocolData)
      const res = Clp.deserializeError(buf)

      assert.deepEqual(res, {
        requestId: 1,
        rejectionReason: this.error,
        protocolData: this.protocolData
      })
    })

    it('should serialize from string without losing data', function () {
      const buf = Clp.serializeError({ rejectionReason: this.errorStr }, 1, this.protocolData)
      const res = Clp.deserializeError(buf)

      assert.deepEqual(res, {
        requestId: 1,
        rejectionReason: this.error,
        protocolData: this.protocolData
      })
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
        rejectionReason: this.error,
        protocolData: this.protocolData
      }, this.reject))
    })

    it('should serialize from buffer without losing data', function () {
      const buf = Clp.serializeReject(this.rejectBuf, 1, this.protocolData)
      const res = Clp.deserializeReject(buf)

      assert.deepEqual(res, Object.assign({
        requestId: 1,
        rejectionReason: this.error,
        protocolData: this.protocolData
      }, this.reject))
    })

    it('should serialize from string without losing data', function () {
      const buf = Clp.serializeReject(this.rejectStr, 1, this.protocolData)
      const res = Clp.deserializeReject(buf)

      assert.deepEqual(res, Object.assign({
        requestId: 1,
        rejectionReason: this.error,
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
