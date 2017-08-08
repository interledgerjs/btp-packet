const Clp = require('..')
const assert = require('chai').assert
const IlpPacket = require('ilp-packet')

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
})
