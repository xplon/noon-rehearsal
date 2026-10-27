"""Adapt the CC0 KayKit Hooded Rogue to Noon Rehearsal.

Requires Blender 4.5. Original topology, body skin and source animation are Kay Lousberg's.
Our changes: palette materials, unused-item removal, selected/resampled clips,
five scene-specific acting clips, a 4.5-head proportion reshape with limb
retargeting, and a real deforming cape with a seated fold.
Blender Z-up/-Y forward -> GLB Y-up/+Z forward. See vendor/kaykit/LICENSE.txt.
"""
import bpy, math, json, hashlib, os, sys
from pathlib import Path
from mathutils import Vector, Quaternion, Matrix
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'assets-src'; VENDOR=SOURCE/'vendor/kaykit'; OUT=ROOT/'public/assets'; PREVIEW=SOURCE/'previews'
for p in [SOURCE,OUT,PREVIEW]: p.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for a in list(bpy.data.actions):bpy.data.actions.remove(a)
bpy.ops.import_scene.gltf(filepath=str(VENDOR/'Rogue_Hooded.glb'))
scene=bpy.context.scene; source_fps=scene.render.fps
rig=next(o for o in scene.objects if o.type=='ARMATURE');rig.name='NoonTraveler';rig.data.name='KayKitTravelerRig'
for t in list(rig.animation_data.nla_tracks):rig.animation_data.nla_tracks.remove(t)
for o in list(scene.objects):
 if o.type=='MESH' and not o.name.startswith('Rogue_'):bpy.data.objects.remove(o,do_unlink=True)
meshes=[o for o in scene.objects if o.type=='MESH'];old_actions={a.name:a for a in bpy.data.actions}
source_vertices={o.name:[v.co.copy() for v in o.data.vertices] for o in meshes}
source_centers={o.name:[sum((o.data.vertices[i].co for i in p.vertices),Vector())/len(p.vertices) for p in o.data.polygons] for o in meshes}
# Imported cape is rigid bone-parented. Convert it to real chest skin before
# reshaping so the added cape.tip control actually deforms its vertices.
rig.data.pose_position='REST';bpy.context.view_layer.update()
for o in meshes:
 if o.parent_type=='BONE':
  bone=o.parent_bone;transform=rig.matrix_world.inverted()@o.matrix_world
  for v in o.data.vertices:v.co=transform@v.co
  o.parent_type='OBJECT';o.parent_bone='';o.matrix_parent_inverse=Matrix.Identity(4);o.matrix_basis=Matrix.Identity(4)
  for g in list(o.vertex_groups):o.vertex_groups.remove(g)
  g=o.vertex_groups.new(name=bone);g.add(list(range(len(o.data.vertices))),1,'REPLACE')
  modifier=o.modifiers.new('Character skin','ARMATURE');modifier.object=rig
rig.data.pose_position='POSE';bpy.context.view_layer.update()

def set_action(action):
 rig.animation_data.action=action
 if action.slots:rig.animation_data.action_slot=action.slots[0]
def frame(value):scene.frame_set(int(value),subframe=value%1);bpy.context.view_layer.update()
world_poses={}
def snapshot():
 pose={p.name:(p.location.copy(),p.rotation_quaternion.copy(),p.scale.copy()) for p in rig.pose.bones}
 world_poses[id(pose)]={p.name:p.matrix.copy() for p in rig.pose.bones}
 return pose
def apply_pose(pose):
 for n,(loc,rot,scale) in pose.items():
  p=rig.pose.bones[n];p.rotation_mode='QUATERNION';p.location=loc;p.rotation_quaternion=rot;p.scale=scale
 bpy.context.view_layer.update()
# Store source sampling before new actions can overwrite rig channels.
def sample_source(name,count):
 a=old_actions[name];set_action(a);end=a.frame_range[1]
 poses=[]
 for i in range(count):frame(end*i/(count-1));poses.append(snapshot())
 return poses
base=sample_source('Idle',2)[0]
FPS=30
specs={
 'idle':dict(source='Idle',duration=3.2,loop=True),
 'walk':dict(source='Walking_A',duration=32/30,loop=True,strideLength=1.0),
 'chase':dict(source='Running_B',duration=.8,loop=True,strideLength=2.48,phaseOffset=.0625),
 'look':dict(source=None,duration=2.4,loop=False),
 'shrug':dict(source=None,duration=2.2,loop=False),
 'sit':dict(source='Sit_Floor_Down',duration=2.2,loop=False,holdLastFrame=True),
 'rise':dict(source='Sit_Floor_StandUp',duration=1.4,loop=False),
 'bow':dict(source=None,duration=2.4,loop=False),
 'turn':dict(source=None,duration=1.8,loop=False),
 'struggle':dict(source=None,duration=2.4,loop=True),
}
source_samples={}
for name,spec in specs.items():
 n=round(spec['duration']*FPS)+1
 if spec['source']:
  if name=='sit':
   # Slower controlled descent (1.4s), then 0.8s seated hold.
   a=old_actions['Sit_Floor_Down'];set_action(a);source_samples[name]=[]
   for i in range(n):frame(a.frame_range[1]*min(1,(i/FPS)/1.4));source_samples[name].append(snapshot())
  else:source_samples[name]=sample_source(spec['source'],n)
rig.animation_data.action=None
sys.path.insert(0,str(SOURCE))
from retarget_proportions import reshape
base,source_samples,proportions=reshape(rig,meshes,base,source_samples,world_poses)
for a in list(bpy.data.actions):bpy.data.actions.remove(a)
apply_pose(base)
stand_hips_height=rig.pose.bones['hips'].head.z
# One additional weighted cape control; geometry and original body skin remain intact.
bpy.context.view_layer.objects.active=rig;rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
cape=next(o for o in meshes if o.name=='Rogue_Cape')
cz=[v.co.z for v in cape.data.vertices];cape_top=max(cz);cape_bottom=min(cz)
b=rig.data.edit_bones.new('cape.tip');b.head=(0,.18,cape_top);b.tail=(0,.35,cape_bottom);b.parent=rig.data.edit_bones['chest'];b.use_deform=True
bpy.ops.object.mode_set(mode='OBJECT')
cape=next(o for o in meshes if o.name=='Rogue_Cape')
for g in list(cape.vertex_groups):cape.vertex_groups.remove(g)
g_top=cape.vertex_groups.new(name='chest');g_tip=cape.vertex_groups.new(name='cape.tip')
for v in cape.data.vertices:
 w=max(0,min(1,(cape_top-v.co.z)/(cape_top-cape_bottom)));w=w*w*(3-2*w);g_tip.add([v.index],w,'REPLACE');g_top.add([v.index],1-w,'REPLACE')
base['cape.tip']=(Vector((0,0,0)),Quaternion((1,0,0,0)),Vector((1,1,1)))
for poses in source_samples.values():
 for pose in poses:pose['cape.tip']=base['cape.tip']
# Convert atlas UV categories to 6 ordinary flat material colors. No runtime map needed.
def linear_hex(h):
 c=[int(h[i:i+2],16)/255 for i in [0,2,4]]
 return tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in c)+(1,)
palette={'Ivory':'F1E2BC','Coral':'D96D53','Ink':'28344A','Leather':'AC7954','Face':'E9B27D','Brass':'D9B571'}
materials={}
for n,h in palette.items():
 m=bpy.data.materials.new(n);m.diffuse_color=linear_hex(h);m.use_nodes=True
 bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=m.diffuse_color;bs.inputs['Roughness'].default_value=.92
 materials[n]=m
for o in meshes:
 uv=o.data.uv_layers.active.data;im=next(n.image for n in o.active_material.node_tree.nodes if n.type=='TEX_IMAGE');pixels=list(im.pixels);width,height=im.size
 categories=[]
 for p in o.data.polygons:
  u=sum(uv[i].uv.x for i in p.loop_indices)/len(p.loop_indices);v=sum(uv[i].uv.y for i in p.loop_indices)/len(p.loop_indices)
  idx=(max(0,min(height-1,int(v*height)))*width+max(0,min(width-1,int(u*width))))*4;r,g,b=pixels[idx:idx+3]
  if o.name=='Rogue_Cape':c='Coral'
  elif r<.18 and g>.24:
   c='Coral' if o.name=='Rogue_Body' and g>1.5*b else 'Ivory'
  elif max(r,g,b)<.32:c='Ink'
  elif max(r,g,b)-min(r,g,b)<.16:c='Brass'
  elif 'Leg' in o.name:c='Ink'
  elif r>.84 and g>.58:c='Face'
  elif 'Head' in o.name:c='Ink'
  elif 'Leg' in o.name:c='Ink'
  else:c='Leather'
  center=source_centers[o.name][p.index]
  if o.name=='Rogue_Body' and c=='Ivory' and center.z>1.075 and center.y<-.10 and abs(center.x)<.245:c='Coral'
  categories.append(c)
 o.data.materials.clear()
 for m in materials.values():o.data.materials.append(m)
 keys=list(materials)
 for p,c in zip(o.data.polygons,categories):p.material_index=keys.index(c)
 if o.name=='Rogue_Body':
  collar_vertices={i for p,c in zip(o.data.polygons,categories) if c=='Coral' for i in p.vertices}
  for v in o.data.vertices:
   source=source_vertices[o.name][v.index]
   if v.index in collar_vertices and source.y<-.06 and source.z>1.05:
    v.co.y-=.075*min(1,(source.z-1.05)/.08)
 o['source']='KayKit Adventurers 1.0 / Kay Lousberg / CC0'
# Pose additions use rotations about armature-space axes, transformed to each local basis.
def rotate(name,axis,angle):
 p=rig.pose.bones[name];world_axis=Vector(axis);local_axis=p.matrix.to_3x3().inverted()@world_axis
 p.rotation_quaternion=p.rotation_quaternion@Quaternion(local_axis,angle);bpy.context.view_layer.update()
def envelope(u):return math.sin(math.pi*u)**2
scene.render.fps=FPS;actions={}
for name,spec in specs.items():
 count=round(spec['duration']*FPS)+1
 action=bpy.data.actions.new(name);rig.animation_data.action=action;actions[name]=action
 for i in range(count):
  u=i/(count-1);apply_pose(source_samples[name][i] if name in source_samples else base)
  if name=='look':
   a=math.sin(2*math.pi*u)*envelope(u);rotate('head',(0,0,1),.52*a);rotate('chest',(0,0,1),.10*a)
  elif name=='shrug':
   e=envelope(u);rotate('upperarm.l',(0,1,0),-.29*e);rotate('upperarm.r',(0,1,0),.29*e)
   rotate('lowerarm.l',(1,0,0),-.63*e);rotate('lowerarm.r',(1,0,0),-.63*e);rotate('head',(0,1,0),.12*e)
  elif name=='bow':
   e=envelope(u);rotate('spine',(1,0,0),.22*e);rotate('chest',(1,0,0),.24*e);rotate('head',(1,0,0),.16*e)
   rotate('upperarm.l',(1,0,0),-.19*e);rotate('upperarm.r',(1,0,0),-.19*e)
  elif name=='turn':
   e=envelope(u);rotate('spine',(0,0,1),.14*e);rotate('chest',(0,0,1),.25*e);rotate('head',(0,0,1),.33*e)
  elif name=='struggle':
   s=math.sin(2*math.pi*u);c=math.cos(2*math.pi*u);rotate('spine',(1,0,0),.11+.05*s);rotate('chest',(0,1,0),.06*c)
   rotate('head',(1,0,0),-.06-.04*s);rotate('upperarm.l',(1,0,0),-.16-.08*s);rotate('upperarm.r',(1,0,0),-.16+.08*s)
   rotate('upperarm.l',(0,1,0),-.13);rotate('upperarm.r',(0,1,0),.13);rotate('lowerarm.l',(1,0,0),-.25-.09*s);rotate('lowerarm.r',(1,0,0),-.25+.09*s)
  if name in ['sit','rise']:
   seated=max(0,min(1,(stand_hips_height-rig.pose.bones['hips'].head.z)/(stand_hips_height-.07)))
   rotate('cape.tip',(1,0,0),1.0*seated)
  # Small delayed cloth response. Loop endpoints and tangents coincide analytically.
  amp=.042 if name=='walk' else .065 if name=='chase' else .014
  if spec['loop']:rotate('cape.tip',(1,0,0),amp*math.sin(2*math.pi*u-.7));rotate('cape.tip',(0,1,0),amp*.35*math.sin(2*math.pi*u))
  else:rotate('cape.tip',(1,0,0),amp*math.sin(2*math.pi*u)*envelope(u))
  for p in rig.pose.bones:
   p.keyframe_insert('location',frame=i,group=p.name);p.keyframe_insert('rotation_quaternion',frame=i,group=p.name);p.keyframe_insert('scale',frame=i,group=p.name)
 for layer in action.layers:
  for strip in layer.strips:
   bag=strip.channelbag(action.slots[0])
   for curve in bag.fcurves:
    for kp in curve.keyframe_points:kp.interpolation='LINEAR'
    if spec['loop'] and len(curve.keyframe_points)>3:
     keys=curve.keyframe_points;v0=keys[0].co.y;vn=keys[-1].co.y
     # Symmetric endpoint tangent: C1 continuity for the baked linear channels.
     d=((keys[1].co.y-v0)+(vn-keys[-2].co.y))*.5
     keys[-1].co.y=v0;keys[1].co.y=v0+d;keys[-2].co.y=v0-d
 # Quaternion tangent projection makes the loop's angular velocity symmetric.
 for layer in action.layers:
  for strip in layer.strips:
   bag=strip.channelbag(action.slots[0]);paths={c.data_path for c in bag.fcurves if c.data_path.endswith('rotation_quaternion')}
   if spec['loop']:
    for path in paths:
     curves=sorted([c for c in bag.fcurves if c.data_path==path],key=lambda c:c.array_index)
     if len(curves)!=4:continue
     q=Vector([c.keyframe_points[0].co.y for c in curves]);d=Vector([c.keyframe_points[1].co.y-c.keyframe_points[0].co.y for c in curves]);d-=q*(d.dot(q)/q.dot(q))
     a=Quaternion(q+d).normalized();b=Quaternion(q-d).normalized()
     for k,c in enumerate(curves):c.keyframe_points[1].co.y=a[k];c.keyframe_points[-2].co.y=b[k]
 action.use_fake_user=True;spec['frames']=count;spec['duration']=round((count-1)/FPS,6)
# Evidence metrics measured on final exported-motion rig, not inferred from names.
metrics={}
for name in ['idle','walk','chase','struggle','sit','rise','bow']:
 set_action(actions[name]);rows=[];count=specs[name]['frames']
 for i in range(count):
  frame(i);rows.append({n:list(rig.matrix_world@rig.pose.bones[n].head) for n in ['root','hips','foot.l','foot.r','toes.l','toes.r']})
 hip=[r['hips'][2] for r in rows]
 metrics[name]={'hipVerticalRange':round(max(hip)-min(hip),6),'rootHorizontalRange':round(max(abs(r['root'][k]) for r in rows for k in [0,1]),6),'footLoopGap':round(max((Vector(rows[0][n])-Vector(rows[-1][n])).length for n in ['foot.l','foot.r']),8),'feetMotionRange':round(max((Vector(r[n])-Vector(rows[0][n])).length for r in rows for n in ['foot.l','foot.r']),6)}
 if name in ['walk','chase']:
  # Conservative stance fit to the support part of left-foot path. Report sliding honestly.
  indices=list(range(1,12)) if name=='walk' else list(range(1,6));times=[i/FPS for i in indices];ys=[rows[i]['foot.l'][1] for i in indices];mt=sum(times)/len(times);my=sum(ys)/len(ys);speed=sum((t-mt)*(y-my) for t,y in zip(times,ys))/sum((t-mt)**2 for t in times)
  residual=[y-speed*t for y,t in zip(ys,times)];metrics[name]['stanceFitSpeed']=round(speed,6);metrics[name]['stanceHorizontalResidualRange']=round(max(residual)-min(residual),6);metrics[name]['stanceFitCycleDistance']=round(speed*specs[name]['duration'],6)
set_action(actions['idle']);frame(0)
deps=bpy.context.evaluated_depsgraph_get();verts=[o.matrix_world@v.co for o in meshes for v in o.evaluated_get(deps).data.vertices]
bounds={k:[round(min(v[i] for v in verts),6),round(max(v[i] for v in verts),6)] for i,k in enumerate(['x','depth','height'])}
height=bounds['height'][1]-bounds['height'][0]
head_mesh=next(o for o in meshes if o.name=='Rogue_Head_Hooded').evaluated_get(deps)
head_z=[(head_mesh.matrix_world@v.co).z for v in head_mesh.data.vertices]
proportions['visibleHoodHeight']=max(head_z)-min(head_z);proportions['standingHeightToHoodRatio']=height/proportions['visibleHoodHeight']
for n in ['walk','chase']:
 specs[n]['strideLength']=round(metrics[n]['stanceFitCycleDistance'],3)
triangles=sum(len(p.vertices)-2 for o in meshes for p in o.data.polygons);vertices=sum(len(o.data.vertices) for o in meshes)
manifest={'name':'Noon Traveler','assetVersion':3,'proportions':proportions,'source':'KayKit Adventurers 1.0 Hooded Rogue by Kay Lousberg','license':'CC0-1.0','sourceCommit':'672074b73ba276876a19e8816ecdc5241817ab47','height':round(height,6),'groundOffset':bounds['height'][0],'bounds':bounds,'forward':'+Z','up':'+Y','rootMotion':False,'bones':len(rig.data.bones),'boneNames':[b.name for b in rig.data.bones],'triangles':triangles,'vertices':vertices,'materials':palette,'clips':specs,'motionMetrics':metrics,'notes':['Sit ends and holds a floor-seated pose; feet extend forward.','Bow begins and ends in the same standing pose.','Walk/chase stride is approximate; source hand-keyed motion has measurable stance slip.','Palette baked into ordinary flat materials; no texture map required.']}
(OUT/'actor-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
# Remove source materials/images unused by the derived character before source saving.
for m in list(bpy.data.materials):
 if m.users==0:bpy.data.materials.remove(m)
for im in list(bpy.data.images):
 if im.users==0 and im.name not in ['Render Result','Viewer Node']:bpy.data.images.remove(im)
rig['license']='CC0-1.0';rig['source']='Kay Lousberg, KayKit Adventurers 1.0';rig['project']='Noon Rehearsal'
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True)
for o in meshes:o.select_set(True)
bpy.context.view_layer.objects.active=rig
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'noon-actor.blend'),compress=True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'actor.glb'),export_format='GLB',use_selection=True,export_yup=True,export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True,export_frame_range=False,export_skins=True,export_morph=False,export_cameras=False,export_lights=False,export_extras=True)
# Consistent front/side/back and actual animation pose renders.
scene.render.engine='CYCLES';scene.cycles.samples=32;scene.render.resolution_x=720;scene.render.resolution_y=900;scene.render.resolution_percentage=100
scene.world.color=(.32,.32,.32);scene.view_settings.view_transform='Standard'
bpy.ops.mesh.primitive_plane_add(size=200);ground=bpy.context.object;ground.location.z=-.008;gm=bpy.data.materials.new('Preview ground');gm.diffuse_color=linear_hex('D5C4A1');ground.data.materials.append(gm)
for loc,power,size in [((3,-4,6),430,5),((-3,-2,4),140,4),((0,3,5),260,3)]:
 bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.rotation_euler=(Vector((0,0,1))-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add();camera=bpy.context.object;camera.data.type='ORTHO';camera.data.ortho_scale=height*(2.95/2.238505);scene.camera=camera
views=[('front','idle',0,(0,-6,2.7)),('side','idle',0,(6,0,2.7)),('back','idle',0,(0,6,2.7)),('three-quarter','idle',0,(3,-6,3)),('walk-contact','walk',0,(3,-6,3)),('walk-pass','walk',9,(3,-6,3)),('walk-lift','walk',24,(3,-6,3)),('chase','chase',6,(3,-6,3)),('sit','sit',66,(3,-6,3)),('rise','rise',21,(3,-6,3)),('bow','bow',36,(3,-6,3)),('shrug','shrug',33,(3,-6,3)),('struggle','struggle',18,(3,-6,3))]
for name,clip,fr,loc in ([] if os.environ.get('NOON_SKIP_PREVIEWS') else views):
 set_action(actions[clip]);frame(fr);camera.location=Vector(loc)*(height/2.238505);camera.rotation_euler=(Vector((0,0,height*.5))-camera.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(PREVIEW/f'{name}.png');bpy.ops.render.render(write_still=True)
print('ASSET_RESULT',json.dumps(manifest))
