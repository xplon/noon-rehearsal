"""Blender pose-space contact audit of the saved, editable character."""
import bpy,json
from pathlib import Path
R=Path(__file__).resolve().parents[1]
bpy.ops.wm.open_mainfile(filepath=str(R/'assets-src/noon-actor.blend'))
rig=bpy.data.objects['NoonTraveler'];meshes=[o for o in bpy.context.scene.objects if o.type=='MESH'];result={}
for name in ['idle','walk','chase','look','shrug','sit','rise','bow','turn','struggle','surprise','reach']:
 a=bpy.data.actions[name];rig.animation_data.action=a;rig.animation_data.action_slot=a.slots[0];rows=[]
 for f in range(round(a.frame_range[1])+1):
  bpy.context.scene.frame_set(f);deps=bpy.context.evaluated_depsgraph_get();mins={o.name:min((o.matrix_world@v.co).z for v in o.evaluated_get(deps).data.vertices) for o in meshes}
  rows.append({'sole':min(v for k,v in mins.items() if 'Leg' in k),'body':mins['Rogue_Body'],'cape':mins['Rogue_Cape'],'all':min(mins.values())})
 result[name]={key:{'min':round(min(r[key] for r in rows),8),'max':round(max(r[key] for r in rows),8),'last':round(rows[-1][key],8)} for key in ['sole','body','cape','all']}
(R/'assets-src/actor-contact-validation.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
