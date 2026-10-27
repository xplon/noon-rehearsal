"""Original Noon Rehearsal actor. Run with Blender 4.5: --background --python this_file.

All geometry, rigging and clips are authored here; no downloaded character or motion.
Blender Z-up / -Y forward exports to glTF Y-up / +Z forward.
"""
import bpy, math, json, os
from mathutils import Vector
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public' / 'assets'
SOURCE = ROOT / 'assets-src'
PREVIEW = SOURCE / 'previews'
for p in (OUT, SOURCE, PREVIEW): p.mkdir(parents=True, exist_ok=True)

bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
for old in list(bpy.data.materials): bpy.data.materials.remove(old)
scene = bpy.context.scene
scene.render.fps = 30

def color(hex):
    c = [int(hex[i:i+2],16)/255 for i in (0,2,4)]
    return tuple(v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4 for v in c)+(1,)

def material(name, hex):
    m=bpy.data.materials.new(name); m.diffuse_color=color(hex); m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF'); bs.inputs['Base Color'].default_value=color(hex)
    bs.inputs['Roughness'].default_value=.95
    return m

M={
 'Cream':material('Cream','FFF0C9'),
 'CreamShade':material('CreamShade','E6CF9C'),
 'Skin':material('Skin','EAD29E'),
 'Coral':material('Coral','DA6049'),
 'CoralShade':material('CoralShade','B74639'),
 'Ink':material('Ink','282D4F'),
 'Stitch':material('Stitch','9D886A'),
}

# A small custom skeleton, with scarf and eye bones for readable secondary acting.
spec={
 'root':((0,0,0),(0,0,.12),None),
 'hips':((0,0,.62),(0,0,.8),'root'),
 'spine':((0,0,.8),(0,0,1.02),'hips'),
 'chest':((0,0,1.02),(0,0,1.16),'spine'),
 'neck':((0,0,1.16),(0,0,1.29),'chest'),
 'head':((0,0,1.29),(0,0,1.62),'neck'),
 'thigh.L':((-.135,0,.65),(-.14,0,.38),'hips'),
 'shin.L':((-.14,0,.38),(-.14,0,.12),'thigh.L'),
 'foot.L':((-.14,0,.12),(-.14,-.18,.08),'shin.L'),
 'thigh.R':((.135,0,.65),(.14,0,.38),'hips'),
 'shin.R':((.14,0,.38),(.14,0,.12),'thigh.R'),
 'foot.R':((.14,0,.12),(.14,-.18,.08),'shin.R'),
 'arm.L':((-.245,0,1.06),(-.34,0,.84),'chest'),
 'forearm.L':((-.34,0,.84),(-.37,-.01,.65),'arm.L'),
 'hand.L':((-.37,-.01,.65),(-.37,-.02,.56),'forearm.L'),
 'arm.R':((.245,0,1.06),(.34,0,.84),'chest'),
 'forearm.R':((.34,0,.84),(.37,-.01,.65),'arm.R'),
 'hand.R':((.37,-.01,.65),(.37,-.02,.56),'forearm.R'),
 'scarf.1':((-.07,-.13,1.18),(-.07,-.2,1.02),'chest'),
 'scarf.2':((-.07,-.2,1.02),(-.09,-.22,.86),'scarf.1'),
 'eye.L':((-.064,-.208,1.49),(-.064,-.208,1.52),'head'),
 'eye.R':((.064,-.208,1.49),(.064,-.208,1.52),'head'),
}
armdata=bpy.data.armatures.new('NoonActorSkeleton')
rig=bpy.data.objects.new('NoonActor',armdata); bpy.context.collection.objects.link(rig)
bpy.context.view_layer.objects.active=rig; rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
for name,(a,b,parent) in spec.items():
    bone=armdata.edit_bones.new(name); bone.head=a; bone.tail=b
    bone.align_roll(Vector((0,1 if b[2]<a[2] else -1,0)))
    if parent: bone.parent=armdata.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT')
rig.select_set(False)
parts=[]

def assign_weights(obj, weights):
    if isinstance(weights,str): weights={weights:1.0}
    for bone in spec: obj.vertex_groups.new(name=bone)
    for v in obj.data.vertices:
        w=weights(v.co) if callable(weights) else weights
        for name,amount in w.items():
            if amount>0: obj.vertex_groups[name].add([v.index],amount,'REPLACE')

def mesh(name, vertices, faces, mat='Cream', weights='spine', smooth=True):
    data=bpy.data.meshes.new(name); data.from_pydata(vertices,[],faces); data.update()
    obj=bpy.data.objects.new(name,data); bpy.context.collection.objects.link(obj)
    obj.data.materials.append(M[mat]); assign_weights(obj,weights)
    for poly in data.polygons: poly.use_smooth=smooth
    parts.append(obj); return obj

def ellipsoid(name, center, scale, mat, bone, rings=14, segments=24):
    verts=[]; faces=[]
    for i in range(rings+1):
        phi=math.pi*i/rings
        for j in range(segments):
            th=2*math.pi*j/segments
            verts.append((center[0]+scale[0]*math.sin(phi)*math.cos(th), center[1]+scale[1]*math.sin(phi)*math.sin(th),center[2]+scale[2]*math.cos(phi)))
    for i in range(rings):
        for j in range(segments):
            a=i*segments+j; b=i*segments+(j+1)%segments
            faces.append((a+segments,b+segments,b,a))
    return mesh(name,verts,faces,mat,bone)

def tube(name, points, radii, mat, bone, segments=12):
    verts=[]; faces=[]
    for i,p in enumerate(points):
        tangent=Vector(points[min(i+1,len(points)-1)])-Vector(points[max(0,i-1)])
        tangent.normalize(); axis=tangent.cross(Vector((0,1,0)))
        if axis.length<.01: axis=tangent.cross(Vector((0,0,1)))
        axis.normalize(); axis2=tangent.cross(axis).normalized()
        r=radii[i] if isinstance(radii,list) else radii
        for j in range(segments):
            th=j*2*math.pi/segments; v=Vector(p)+r*(math.cos(th)*axis+math.sin(th)*axis2); verts.append(tuple(v))
    for i in range(len(points)-1):
        for j in range(segments):
            a=i*segments+j; b=i*segments+(j+1)%segments; faces.append((a,b,b+segments,a+segments))
    faces.append(tuple(reversed(tuple(range(segments)))))
    faces.append(tuple((len(points)-1)*segments+j for j in range(segments)))
    return mesh(name,verts,faces,mat,bone)

def torso_weights(v):
    if v.z<.65: return {'hips':1}
    if v.z<.87:
        a=(v.z-.65)/.22; return {'hips':1-a,'spine':a}
    if v.z<1.04:
        a=(v.z-.87)/.17; return {'spine':1-a,'chest':a}
    return {'chest':1}

# Sculpted continuous coat with an asymmetric hand-cut hem and subtle panel planes.
profiles=[(.52,.30,.18),(.55,.315,.19),(.61,.30,.20),(.74,.26,.19),(.88,.235,.17),(1.0,.267,.17),(1.075,.23,.155),(1.13,.14,.115)]
verts=[]; faces=[]; count=40
for i,(z,rx,ry) in enumerate(profiles):
    for j in range(count):
        a=2*math.pi*j/count
        hem=(.014*math.cos(3*a)+.008*math.sin(5*a))*(1-i/(len(profiles)-1))
        pleat=1+.018*math.cos(8*a)
        verts.append((rx*math.cos(a)*pleat,ry*math.sin(a)*pleat,z+hem))
for i in range(len(profiles)-1):
    for j in range(count):
        a=i*count+j; b=i*count+(j+1)%count; faces.append((a,b,b+count,a+count))
faces.extend([tuple(reversed(tuple(range(count)))),tuple((len(profiles)-1)*count+j for j in range(count))])
coat=mesh('SculptedCoat',verts,faces,'Cream',torso_weights)
coat.data.materials.append(M['CreamShade'])
for p in coat.data.polygons:
    if p.center.x<-.21: p.material_index=1

# Cape/mantle, open at the throat and lifting slightly at the shoulders.
verts=[]; faces=[]; n=40
for z,rx,ry in [(1.04,.31,.21),(1.09,.30,.205),(1.16,.21,.155),(1.20,.135,.115)]:
    for j in range(n):
        a=2*math.pi*j/n
        verts.append((rx*math.cos(a),ry*math.sin(a),z+.015*math.cos(2*a)))
for i in range(3):
    for j in range(n):
        a=i*n+j; b=i*n+(j+1)%n; faces.append((a,b,b+n,a+n))
mantle=mesh('ShoulderMantle',verts,faces,'Cream','chest')
# Fine ochre piping follows the hem: intentional costume detail rather than a texture.
ring=[(.314*math.cos(t*2*math.pi/64),.212*math.sin(t*2*math.pi/64),1.04+.015*math.cos(t*4*math.pi/64)) for t in range(65)]
tube('MantlePiping',ring,.007,'CreamShade','chest',8)

# Limbs: tapered cloth sleeves and jointed ink-blue stockings.
for side,xsign in [('L',-1),('R',1)]:
    tube('StockingUpper.'+side,[(xsign*.135,0,.66),(xsign*.14,0,.38)],[.068,.054],'Ink','thigh.'+side)
    tube('StockingLower.'+side,[(xsign*.14,0,.4),(xsign*.14,0,.13)],[.055,.043],'Ink','shin.'+side)
    shoe=ellipsoid('SoftShoe.'+side,(xsign*.14,-.065,.083),(.085,.155,.078),'Ink','foot.'+side,10,20)
    tube('ShoeTop.'+side,[(xsign*.14,.015,.14),(xsign*.14,-.095,.145)],[.048,.047],'CreamShade','foot.'+side,10)
    tube('UpperSleeve.'+side,[(xsign*.24,0,1.065),(xsign*.335,0,.84)],[.09,.067],'Cream','arm.'+side,16)
    tube('LowerSleeve.'+side,[(xsign*.335,0,.85),(xsign*.37,-.01,.67)],[.068,.058],'Cream','forearm.'+side,16)
    tube('Cuff.'+side,[(xsign*.365,-.01,.695),(xsign*.37,-.01,.657)],[.062,.062],'Coral','forearm.'+side,16)
    ellipsoid('Mitten.'+side,(xsign*.37,-.012,.603),(.059,.047,.073),'Skin','hand.'+side,10,16)
    ellipsoid('Thumb.'+side,(xsign*.32,-.03,.62),(.026,.032,.04),'Skin','hand.'+side,8,12)

# Neck and a complete sculpted hood shell. The front opening frames the oval face.
ellipsoid('Neck',(0,0,1.22),(.10,.085,.13),'Skin','neck',10,16)
verts=[]; faces=[]; nr=24; ns=48
for i in range(nr+1):
    t=i/nr; u=-.63+1.63*t; radius=math.sqrt(max(0,1-u*u))
    for j in range(ns):
        a=2*math.pi*j/ns
        x=.24*radius*math.cos(a)
        y=.205*u-.018*math.sin(a)*(1-t)
        z=1.465+.28*radius*math.sin(a)
        x-=max(0,z-1.65)*.1
        verts.append((x,y,z))
for i in range(nr):
    for j in range(ns):
        a=i*ns+j; b=i*ns+(j+1)%ns
        faces.append((a+ns,b+ns,b,a))
hood=mesh('OpenSculptedHood',verts,faces,'Cream','head')
ellipsoid('Face',(0,-.127,1.465),(.174,.087,.202),'Skin','head',18,28)
rim=[]
for j in range(65):
    a=2*math.pi*j/64
    rim.append((.1864*math.cos(a),-.12915-.018*math.sin(a),1.465+.2175*math.sin(a)))
tube('HoodRolledEdge',rim,.018,'Cream','head',10)
for side,x in [('L',-.064),('R',.064)]:
    ellipsoid('Eye.'+side,(x,-.211,1.493),(.014,.009,.021),'Ink','eye.'+side,10,16)
ellipsoid('Nose',(0,-.221,1.447),(.017,.025,.021),'Skin','head',10,16)
tube('Mouth',[(-.019,-.210,1.392),(0,-.214,1.388),(.019,-.210,1.392)],.003,'Stitch','head',6)
# A quiet seam across the back of the hood.
seam=[]
for i in range(20):
    a=.08+(math.pi-.16)*i/19
    seam.append((-.009,.2057*math.sin(a),1.465+.281*math.cos(a)))
tube('HoodBackSeam',seam,.0045,'CreamShade','head',6)

# Scarf collar and a two-bone tapered cloth tail, with an asymmetric cut edge.
scarf_ring=[(.141*math.cos(t*2*math.pi/48),.116*math.sin(t*2*math.pi/48),1.215+.009*math.cos(t*2*math.pi/48)) for t in range(49)]
tube('ScarfCollar',scarf_ring,.035,'Coral','chest',12)
ellipsoid('ScarfKnot',(-.07,-.14,1.19),(.063,.045,.052),'Coral','chest',10,16)
verts=[]; faces=[]
for i in range(9):
    t=i/8; z=1.19-.33*t; y=-.20-.06*t-.02*math.sin(math.pi*t); x=-.07-.018*t; width=.055*(1-.25*t)
    for back in [False,True]:
        for s in [-1,1]: verts.append((x+s*width,y+(.008 if back else -.008),z+(.02*s if i==8 else 0)))
for i in range(8):
    a=i*4; b=a+4
    faces.extend([(a,a+1,b+1,b),(a+3,a+2,b+2,b+3),(a+2,a,b,b+2),(a+1,a+3,b+3,b+1)])
faces.extend([(0,2,3,1),(32,33,35,34)])
def scarf_weights(v):
    f=max(0,min(1,(1.04-v.z)/.12)); return {'scarf.1':1-f,'scarf.2':f}
mesh('ScarfTail',verts,faces,'Coral',scarf_weights)
# Small brass-colored toggle anchors the cloak, visible without texture.
ellipsoid('Toggle',(0,-.184,1.03),(.035,.012,.018),'CreamShade','chest',8,12)

# Join into a single material-indexed skinned mesh. This also simplifies shadow clones.
bpy.ops.object.select_all(action='DESELECT')
for obj in parts: obj.select_set(True)
bpy.context.view_layer.objects.active=coat; bpy.ops.object.join()
actor=bpy.context.object; actor.name='ActorMesh'; actor.data.name='OriginalNoonActorMesh'
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.normals_make_consistent(inside=False); bpy.ops.object.mode_set(mode='OBJECT')
mod=actor.modifiers.new('ActorSkin','ARMATURE'); mod.object=rig
actor.parent=rig
for pb in rig.pose.bones: pb.rotation_mode='XYZ'

def reset_pose():
    for pb in rig.pose.bones:
        pb.location=(0,0,0); pb.rotation_euler=(0,0,0); pb.scale=(1,1,1)

def rotate(name,x=0,y=0,z=0): rig.pose.bones[name].rotation_euler=(x,y,z)
def offset(name,x=0,y=0,z=0): rig.pose.bones[name].location=(x,y,z)

clips={}
def make_action(name,seconds,fn,step=2):
    reset_pose(); action=bpy.data.actions.new(name); rig.animation_data_create(); rig.animation_data.action=action
    end=round(seconds*30)+1
    frames=list(range(1,end+1,step))
    if frames[-1]!=end:frames.append(end)
    for frame in frames:
        reset_pose(); t=(frame-1)/30; u=t/seconds; fn(t,u)
        for pb in rig.pose.bones:
            pb.keyframe_insert('location',frame=frame,group=pb.name)
            pb.keyframe_insert('rotation_euler',frame=frame,group=pb.name)
            pb.keyframe_insert('scale',frame=frame,group=pb.name)
    action.use_fake_user=True
    clips[name]={'seconds':seconds,'frames':end,'loop':name in ['idle','walk','chase','look','sit']}
    return action

def breathe(t,u):
    s=math.sin(u*2*math.pi)
    rotate('chest',x=.014*s); rotate('head',x=-.012*s,z=.025*s)
    rotate('scarf.1',x=.035*s); rotate('scarf.2',x=.045*math.sin(u*2*math.pi-.5))
    blink=.1 if .73<u<.78 else 1
    for n in ['eye.L','eye.R']:rig.pose.bones[n].scale=(1,blink,1)

def locomotion(t,u,fast=False):
    a=u*2*math.pi; amp=.65 if fast else .42
    for side,phase in [('L',0),('R',math.pi)]:
        s=math.sin(a+phase)
        rotate('thigh.'+side,x=amp*s)
        rotate('shin.'+side,x=max(0,-s)*(.75 if fast else .48))
        rotate('foot.'+side,x=.12*s)
        rotate('arm.'+side,x=-.32*s,y=(.06 if side=='L' else -.06))
        rotate('forearm.'+side,x=-.16-(.35 if fast else .04)*max(0,-s))
    # Local hips Y follows the bone's vertical axis, while X stays centered.
    offset('hips',y=(.012 if fast else .003)*(1-math.cos(a*2)))
    rotate('spine',x=.12 if fast else .035,z=.025*math.sin(a))
    rotate('head',x=-.06 if fast else -.015,z=-.02*math.sin(a))
    rotate('scarf.1',x=-.1-.08*math.sin(a));rotate('scarf.2',x=-.06-.12*math.sin(a-.5))

def look(t,u):
    s=.5-.5*math.cos(u*2*math.pi)
    rotate('neck',x=.15*s);rotate('head',x=.35*s,z=.17*math.sin(u*2*math.pi))
    rotate('chest',x=.06*s);rotate('arm.L',z=-.08*s);rotate('arm.R',z=.08*s)

def shrug(t,u):
    s=math.sin(math.pi*u)**2
    rotate('arm.L',x=-.18*s,z=.8*s);rotate('arm.R',x=-.18*s,z=-.8*s)
    rotate('forearm.L',x=-.75*s);rotate('forearm.R',x=-.75*s)
    rotate('hand.L',y=-.5*s);rotate('hand.R',y=.5*s)
    rotate('head',z=.16*s);offset('chest',y=.035*s)

def sit(t,u):
    # A held seated pose, caller cross-fades into it. Root horizontal position stays fixed.
    offset('hips',y=-.455)
    rotate('thigh.L',x=-1.45,z=.12);rotate('thigh.R',x=-1.45,z=-.12)
    rotate('shin.L',x=.05);rotate('shin.R',x=.05)
    rotate('foot.L',x=1.4);rotate('foot.R',x=1.4)
    rotate('spine',x=.12);rotate('head',x=.1)
    rotate('arm.L',x=-.55,z=-.14);rotate('arm.R',x=-.55,z=.14)
    rotate('forearm.L',x=.6);rotate('forearm.R',x=.6)
    rotate('scarf.1',x=.15);rotate('scarf.2',x=.1)
    rotate('head',x=.1+.02*math.sin(u*2*math.pi))

def bow(t,u):
    s=math.sin(math.pi*u)**2
    rotate('hips',x=.15*s);rotate('spine',x=.55*s);rotate('chest',x=.23*s);rotate('head',x=.18*s)
    rotate('arm.L',x=.2*s,z=.16*s);rotate('arm.R',x=.2*s,z=-.16*s)
    rotate('forearm.L',x=.2*s);rotate('forearm.R',x=.2*s)
    rotate('scarf.1',x=-.35*s);rotate('scarf.2',x=-.15*s)

def turn(t,u):
    s=math.sin(math.pi*u)**2; rotate('head',y=.55*s);rotate('chest',y=.25*s);rotate('arm.R',x=-.15*s)

actions={
 'idle':make_action('idle',3.2,breathe),
 'walk':make_action('walk',.8,lambda t,u:locomotion(t,u)),
 'chase':make_action('chase',.6,lambda t,u:locomotion(t,u,True)),
 'look':make_action('look',2.4,look),
 'shrug':make_action('shrug',2.2,shrug),
 'sit':make_action('sit',3.2,sit),
 'bow':make_action('bow',2.5,bow),
 'turn':make_action('turn',1.8,turn),
}
rig.animation_data.action=actions['idle']; reset_pose(); scene.frame_set(1)
rig['asset_author']='Original procedural sculpture and animation for Noon Rehearsal'
rig['forward']='Blender -Y / glTF +Z'; rig['source_script']='scripts/build_character.py'
rig['animation_note']='In-place root; sit lowers hips by 0.455 m, not actor origin.'

# Save editable asset before adding presentation-only cameras/lights.
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'noon-actor.blend'))
bpy.ops.object.select_all(action='DESELECT'); actor.select_set(True);rig.select_set(True)
bpy.context.view_layer.objects.active=rig
bpy.ops.export_scene.gltf(filepath=str(OUT/'actor.glb'),export_format='GLB',use_selection=True,
    export_yup=True,export_animations=True,export_animation_mode='ACTIONS',
    export_force_sampling=True,export_frame_range=False,export_skins=True,
    export_morph=False,export_cameras=False,export_lights=False,export_extras=True)

triangles=sum(len(p.vertices)-2 for p in actor.data.polygons)
manifest={'name':'Noon Actor','version':1,'file':'actor.glb','source':'assets-src/noon-actor.blend',
 'generator':'scripts/build_character.py','units':'meters','up':'+Y','forward':'+Z','height':1.745,
 'mesh':'ActorMesh','skeleton':'NoonActor','bones':list(spec.keys()),'boneCount':len(spec),
 'triangles':triangles,'vertices':len(actor.data.vertices),'materials':list(M.keys()),'clips':clips,
 'rootMotion':False,'sitNote':'Sit clip lowers hips 0.455 m; keep scene actor origin on ground.',
 'license':'Original project asset; no external model or motion sources.'}
(OUT/'actor-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')

# Presentation renders use precisely the exported model source, with no hidden mesh fixes.
scene.render.engine='CYCLES';scene.cycles.samples=32
scene.render.resolution_x=720;scene.render.resolution_y=900;scene.render.resolution_percentage=100
scene.view_settings.view_transform='Standard';scene.view_settings.look='Medium High Contrast' if 'Medium High Contrast' in [] else 'None'
scene.world.color=(.7,.7,.7)
world=scene.world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.68,.65,.55,1);world.node_tree.nodes['Background'].inputs[1].default_value=.7
floor=material('PreviewFloor','F3C641')
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.008)); plane=bpy.context.object;plane.data.materials.append(floor)
bpy.ops.object.light_add(type='AREA',location=(-3,-4,6));light=bpy.context.object;light.data.energy=350;light.data.shape='DISK';light.data.size=4
bpy.ops.object.camera_add(location=(3,-6,3));cam=bpy.context.object;scene.camera=cam;cam.data.type='ORTHO';cam.data.ortho_scale=2.3
def camera_at(location):
    cam.location=location;direction=Vector((0,0,.84))-cam.location;cam.rotation_euler=direction.to_track_quat('-Z','Y').to_euler()

views=[('front','idle',1,(0,-5,2.2)),('three-quarter','idle',1,(3,-5,2.6)),('side','idle',1,(5,-.1,2.2)),('back','idle',1,(0,5,2.2)),('walk','walk',7,(3,-5,2.6)),('sit','sit',18,(3,-5,2.6)),('bow','bow',38,(3,-5,2.6)),('shrug','shrug',34,(3,-5,2.6))]
for name,action,frame,loc in views:
    rig.animation_data.action=actions[action];scene.frame_set(frame);camera_at(loc)
    scene.render.filepath=str(PREVIEW/f'{name}.png');bpy.ops.render.render(write_still=True)
print('ACTOR_BUILD_DONE '+json.dumps(manifest))
