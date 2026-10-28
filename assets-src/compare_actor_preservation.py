"""Compare an older GLB with the current asset, ignoring newly added actions.
Usage: python3 assets-src/compare_actor_preservation.py /path/to/previous.glb
"""
import json,struct,sys,hashlib
from pathlib import Path
root=Path(__file__).resolve().parents[1]
class GLB:
 def __init__(self,p):
  b=Path(p).read_bytes();n=struct.unpack_from('<I',b,12)[0];self.g=json.loads(b[20:20+n]);self.bin=b[28+n:]
 def acc(self,i):
  a=self.g['accessors'][i];v=self.g['bufferViews'][a['bufferView']];o=v.get('byteOffset',0)+a.get('byteOffset',0);size={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']];fmt={5126:'f',5123:'H',5125:'I',5121:'B'}[a['componentType']];stride=v.get('byteStride',struct.calcsize(fmt)*size)
  return [struct.unpack_from('<'+fmt*size,self.bin,o+j*stride) for j in range(a['count'])]
 def clips(self):
  out={}
  for a in self.g['animations']:
   channels={}
   for c in a['channels']:
    s=a['samplers'][c['sampler']];key=(self.g['nodes'][c['target']['node']]['name'],c['target']['path']);channels[key]={'times':self.acc(s['input']),'values':self.acc(s['output']),'interpolation':s.get('interpolation','LINEAR')}
   out[a['name']]=channels
  return out
old=GLB(sys.argv[1]);new=GLB(root/'public/assets/actor.glb');report={'baseline':str(sys.argv[1]),'baselineSha256':hashlib.sha256(Path(sys.argv[1]).read_bytes()).hexdigest(),'currentSha256':hashlib.sha256((root/'public/assets/actor.glb').read_bytes()).hexdigest(),'meshMaxDifference':0,'skinMaxDifference':0,'oldClips':{}}
def difference(a,b):
 assert len(a)==len(b)
 return max((abs(x-y) for r,s in zip(a,b) for x,y in zip(r,s)),default=0)
assert len(old.g['meshes'])==len(new.g['meshes'])
for om,nm in zip(old.g['meshes'],new.g['meshes']):
 assert om['name']==nm['name'];assert len(om['primitives'])==len(nm['primitives'])
 for op,np in zip(om['primitives'],nm['primitives']):
  assert set(op['attributes'])==set(np['attributes'])
  for k in op['attributes']:report['meshMaxDifference']=max(report['meshMaxDifference'],difference(old.acc(op['attributes'][k]),new.acc(np['attributes'][k])))
  assert old.acc(op['indices'])==new.acc(np['indices'])
for os,ns in zip(old.g['skins'],new.g['skins']):
 assert [old.g['nodes'][i]['name'] for i in os['joints']]==[new.g['nodes'][i]['name'] for i in ns['joints']]
 report['skinMaxDifference']=max(report['skinMaxDifference'],difference(old.acc(os['inverseBindMatrices']),new.acc(ns['inverseBindMatrices'])))
a=old.clips();b=new.clips()
for name,channels in a.items():
 assert channels.keys()==b[name].keys();md=0
 for key,v in channels.items():
  nv=b[name][key];assert v['times']==nv['times'];assert v['interpolation']==nv['interpolation'];md=max(md,difference(v['values'],nv['values']))
 report['oldClips'][name]={'maxChannelDifference':md,'channels':len(channels)}
assert report['meshMaxDifference']==0 and report['skinMaxDifference']==0
assert all(v['maxChannelDifference']==0 for v in report['oldClips'].values())
report['addedClips']=sorted(set(b)-set(a));report['preservedExactly']=True
(root/'assets-src/actor-v4-preservation.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
