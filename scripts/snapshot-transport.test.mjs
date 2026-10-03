import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SnapshotTransport } from '../frontend/snapshotTransport.ts';
test('loss and out-of-order state packets never roll back accepted state',()=>{
 const sender=new SnapshotTransport('one');sender.setPublisher('host');const receiver=new SnapshotTransport('viewer');receiver.setHost('host',['one']);
 const first=sender.stamp({phase:'PLAYING',position:1});sender.stamp({position:2});const third=sender.stamp({phase:'PLAYING',position:3});assert.equal(receiver.accept(third),true);assert.equal(receiver.accept(first),false);assert.equal(receiver.accept(third),false);
});
test('host migration accepts a new host and fences departed host packets',()=>{
 const a=new SnapshotTransport('a');a.setPublisher('A');const b=new SnapshotTransport('b');b.setPublisher('B');const r=new SnapshotTransport('r');r.setHost('A',['a']);assert.equal(r.accept(a.stamp({})),true);r.setHost('B',['b']);assert.equal(r.accept(a.stamp({})),false);assert.equal(r.accept(b.stamp({phase:'THEATER'})),true);r.setHost('',[]);assert.equal(r.accept(b.stamp({})),false);
});
test('reload of the same device uses a fresh session; retired session is rejected',()=>{
 const old=new SnapshotTransport('old');old.setPublisher('host');const next=new SnapshotTransport('new');next.setPublisher('host');const r=new SnapshotTransport('viewer');r.setHost('host',['old']);assert.equal(r.accept(old.stamp({})),true);r.setHost('host',['new']);assert.equal(r.accept(next.stamp({})),true);assert.equal(r.accept(old.stamp({})),false);
});
test('legacy snapshots still restore state, ordering metadata adds no sends',()=>{
 const r=new SnapshotTransport('viewer');assert.equal(r.accept({phase:'THEATER'}),true);const s=new SnapshotTransport('host');s.setPublisher('A');assert.equal(s.stamp({snapshot:{version:1}}).sequence,1);assert.equal(s.stamp({snapshot:{version:1}}).sequence,2);
});
