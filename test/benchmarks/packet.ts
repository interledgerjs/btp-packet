const Benchmark = require('benchmark')
import * as PacketV1 from '../..'
const packageV0 = process.argv[2]
if (!packageV0) {
  console.error('usage: node ' + process.argv.slice(0, 2).join(' ') + ' <v0>')
  process.exit(1)
}
const PacketV0 = require(packageV0)

const messagePacket: PacketV1.BtpMessagePacket = {
  type: PacketV1.TYPE_MESSAGE,
  requestId: 123,
  data: {
    protocolData: [{
      protocolName: 'ilp',
      contentType: PacketV1.MIME_APPLICATION_OCTET_STREAM,
      data: Buffer.from('0c68000000000000006b323031373132323330313231343035343974e1136dc71c9e5f283bec83461cbf1261c4014f72d48f8dd65453a0b84e7de10d6578616d706c652e616c696365205db343fdc41898f6df4202329139dc242dd0f558a811b46b28918fdab37c6cb0', 'hex')
    }]
  }
}
const messageBuffer = PacketV1.serialize(messagePacket)

// TODO test Transfer, Response, Error

;(new Benchmark.Suite('serialize: Message'))
  .add('v0', function () { PacketV0.serialize(messagePacket) })
  .add('v1', function () { PacketV1.serialize(messagePacket) })
  .on('cycle', function(event: any) {
    console.log(this.name, '\t', String(event.target));
  })
  .run({})

;(new Benchmark.Suite('deserialize: Message'))
  .add('v0', function () { PacketV0.deserialize(messageBuffer) })
  .add('v1', function () { PacketV1.deserialize(messageBuffer) })
  .on('cycle', function(event: any) {
    console.log(this.name, '\t', String(event.target));
  })
  .run({})
