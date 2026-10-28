"""Validate exported GLB numerical data and loop boundary velocities (stdlib only)."""
import json,struct,math
from pathlib import Path
root=Path(__file__).resolve().parents[1]
b=(root/'public/assets/actor.glb').read_bytes();jl=struct.unpack_from('<I',b,12)[0];g=json.loads(b[20:20+jl]);blob=b[28+jl:]
def acc(index):
 a=g['accessors'][index];view=g['bufferViews'][a['bufferView']];start=view.get('byteOffset',0)+a.get('byteOffset',0)
 size={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']];fmt={5126:'f',5123:'H',5125:'I',5121:'B'}[a['componentType']];stride=view.get('byteStride',struct.calcsize(fmt)*size)
 return [struct.unpack_from('<'+fmt*size,blob,start+i*stride) for i in range(a['count'])]
def qmul(a,b):
 x,y,z,w=a;X,Y,Z,W=b;return (w*X+x*W+y*Z-z*Y,w*Y-x*Z+y*W+z*X,w*Z+x*Y-y*X+z*W,w*W-x*X-y*Y-z*Z)
def inv(q):return (-q[0],-q[1],-q[2],q[3])
def angular(a,b,dt):
 q=qmul(b,inv(a));n=math.sqrt(sum(x*x for x in q));q=[x/n for x in q]
 if q[3]<0:q=[-x for x in q]
 si=math.sqrt(sum(x*x for x in q[:3]));angle=2*math.atan2(si,q[3]);return [x*(angle/si/dt if si>1e-10 else 0) for x in q[:3]]
for i in range(len(g['accessors'])):
 assert all(math.isfinite(x) for row in acc(i) for x in row),f'nonfinite accessor {i}'
loops={'idle','walk','chase','struggle'};report={'bytes':len(b),'skins':len(g['skins']),'joints':len(g['skins'][0]['joints']),'embeddedOnly':not any('uri' in x for x in g.get('buffers',[])+g.get('images',[])),'clips':{}}
for anim in g['animations']:
 gaps=[];rotation=[];linear=[];duration=0
 for ch in anim['channels']:
  sampler=anim['samplers'][ch['sampler']];v=acc(sampler['output']);t=[x[0] for x in acc(sampler['input'])];duration=max(duration,t[-1]);gaps.append(max(abs(a-b) for a,b in zip(v[0],v[-1])))
  if len(v)<3:continue
  if ch['target']['path']=='rotation':
   a=angular(v[0],v[1],t[1]-t[0]);z=angular(v[-2],v[-1],t[-1]-t[-2]);rotation.append(math.sqrt(sum((x-y)**2 for x,y in zip(a,z))))
  else:linear.append(max(abs((v[1][k]-v[0][k])/(t[1]-t[0])-(v[-1][k]-v[-2][k])/(t[-1]-t[-2])) for k in range(len(v[0]))))
 report['clips'][anim['name']]={'duration':round(duration,6),'endpointComponentGap':max(gaps),'angularVelocitySeamRadPerSec':max(rotation,default=0),'linearVelocitySeam':max(linear,default=0),'loop':anim['name'] in loops}
 if anim['name'] in loops:assert max(gaps)<1e-5;assert max(rotation,default=0)<.001;assert max(linear,default=0)<.0001
assert {a['name'] for a in g['animations']}=={'idle','walk','chase','look','shrug','sit','rise','bow','turn','struggle','surprise','reach'}
anims={a['name']:a for a in g['animations']}
def pose(name,index):
 a=anims[name];return {(c['target']['node'],c['target']['path']):acc(a['samplers'][c['sampler']]['output'])[index] for c in a['channels']}
report['transitions']={}
for n1,i1,n2,i2 in [('sit',-1,'rise',0),('rise',-1,'idle',0),('idle',0,'sit',0),('idle',0,'surprise',0),('surprise',-1,'idle',0),('idle',0,'reach',0),('reach',-1,'idle',0)]:
 a=pose(n1,i1);b=pose(n2,i2);rows=[(max(abs(x-y) for x,y in zip(v,b[k])),g['nodes'][k[0]]['name']) for k,v in a.items() if k in b]
 report['transitions'][n1+'->'+n2]={'maxComponentGap':max(v for v,_ in rows),'maxBodyGap':max(v for v,n in rows if n!='cape.tip')}
assert report['transitions']['sit->rise']['maxComponentGap']<1e-5
assert report['transitions']['rise->idle']['maxBodyGap']<1e-5
for name in ['idle->surprise','surprise->idle','idle->reach','reach->idle']:
 assert report['transitions'][name]['maxComponentGap']<1e-5
(root/'assets-src/actor-validation.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
