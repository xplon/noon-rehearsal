"""Blender pose-space contact audit of the saved, editable character."""
import bpy,json
from pathlib import Path
R=Path(__file__).resolve().parents[1]
bpy.ops.wm.open_mainfile(filepath=str(R/'assets-src/noon-actor.blend'))
rig=bpy.data.objects['NoonTraveler'];meshes=[o for o in bpy.context.scene.objects if o.type=='MESH'];result={}
# Use actual skinned vertices belonging to each boot, not ankle joint height.
foot_vertices={side:{} for side in ['l','r']}
for side in foot_vertices:
 for o in meshes:
  ids={v.index for v in o.vertex_groups if v.name in ['foot.'+side,'toes.'+side]}
  vertices=[v.index for v in o.data.vertices if sum(g.weight for g in v.groups if g.group in ids)>.6]
  if vertices:foot_vertices[side][o.name]=vertices
 assert foot_vertices[side],side
pivot_checks={}
for name in ['idle','walk','chase','look','shrug','sit','rise','bow','turn','struggle','surprise','reach','pivot_left','pivot_right']:
 a=bpy.data.actions[name];rig.animation_data.action=a;rig.animation_data.action_slot=a.slots[0];rows=[];foot_rows=[];joint_rows=[]
 for f in range(round(a.frame_range[1])+1):
  bpy.context.scene.frame_set(f);deps=bpy.context.evaluated_depsgraph_get();mins={o.name:min((o.matrix_world@v.co).z for v in o.evaluated_get(deps).data.vertices) for o in meshes}
  foot_rows.append({side:min((o.matrix_world@o.evaluated_get(deps).data.vertices[i].co).z for o in meshes if o.name in pieces for i in pieces[o.name]) for side,pieces in foot_vertices.items()})
  joint_rows.append({n:list(rig.matrix_world@rig.pose.bones[n].head) for n in ['root','hips','foot.l','foot.r']})
  rows.append({'sole':min(v for k,v in mins.items() if 'Leg' in k),'body':mins['Rogue_Body'],'cape':mins['Rogue_Cape'],'all':min(mins.values())})
 result[name]={key:{'min':round(min(r[key] for r in rows),8),'max':round(max(r[key] for r in rows),8),'last':round(rows[-1][key],8)} for key in ['sole','body','cape','all']}
 if name.startswith('pivot_'):
  count=len(rows)-1;first='r' if name=='pivot_right' else 'l';stance_errors=[]
  for i,row in enumerate(joint_rows):
   u=i/count
   for side in ['l','r']:
    swing=(0<u<.5) if side==first else (.5<u<1)
    if not swing:stance_errors.append(max(abs(row['foot.'+side][k]-joint_rows[0]['foot.'+side][k]) for k in range(3)))
  pivot_checks[name]={'soleMin':min(r[s] for r in foot_rows for s in ['l','r']),'supportSoleMax':max(min(r.values()) for r in foot_rows),'leftSoleLift':max(r['l'] for r in foot_rows)-foot_rows[0]['l'],'rightSoleLift':max(r['r'] for r in foot_rows)-foot_rows[0]['r'],'supportAnkleMaxDisplacement':max(stance_errors),'rootHorizontalRange':max(max(r['root'][k] for r in joint_rows)-min(r['root'][k] for r in joint_rows) for k in [0,1]),'hipsHorizontalRange':max(max(r['hips'][k] for r in joint_rows)-min(r['hips'][k] for r in joint_rows) for k in [0,1])}
  c=pivot_checks[name]
  assert c['soleMin']>-.0003 and c['supportSoleMax']<.0003,c
  assert .08<c['leftSoleLift']<.14 and .08<c['rightSoleLift']<.14,c
  assert max(c[k] for k in ['supportAnkleMaxDisplacement','rootHorizontalRange','hipsHorizontalRange'])<1e-5,c
(R/'assets-src/actor-pivot-contact-validation.json').write_text(json.dumps(pivot_checks,indent=2)+'\n')
(R/'assets-src/actor-contact-validation.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
