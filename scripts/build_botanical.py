"""Adapt Kenney's CC0 plant_bushDetailed; keep the existing authored leaf mesh."""
import bpy,json,hashlib,math
from pathlib import Path
from mathutils import Vector
R=Path(__file__).resolve().parents[1];V=R/'assets-src/vendor/kenney-botanical';O=R/'public/assets'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(V/'plant_bushDetailed.glb'))
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
for o in meshes:
 world=o.matrix_world.copy()
 for vertex in o.data.vertices:vertex.co=world@vertex.co
 o.parent=None;o.matrix_world.identity()
points=[v.co.copy() for o in meshes for v in o.data.vertices];bottom=min(v.z for v in points);height=max(v.z for v in points)-bottom
for o in meshes:
 for v in o.data.vertices:v.co=Vector((v.co.x*.64/height,v.co.y*.64/height,(v.co.z-bottom)/height))
 o.data.update();o.name='Kenney leaf rosette'
def material(name,hex):
 rgb=[int(hex[i:i+2],16)/255 for i in (0,2,4)];linear=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in rgb]
 m=bpy.data.materials.new(name);m.diffuse_color=(*linear,1);m.use_nodes=True;bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*linear,1);bs.inputs['Roughness'].default_value=.95;return m
palette={'LeafGreen':'648C6B','LeafLight':'83A385','LeafDeep':'416956'};materials=[material(k,v) for k,v in palette.items()]
for o in meshes:
 o.data.materials.clear()
 for m in materials:o.data.materials.append(m)
 for p in o.data.polygons:p.material_index=1 if p.normal.z>.45 else 2 if p.normal.z<-.2 else 0
 o['creator']='Kenney';o['source']='Nature Kit / plant_bushDetailed';o['license']='CC0-1.0'
for o in list(bpy.context.scene.objects):
 if o.type!='MESH':bpy.data.objects.remove(o,do_unlink=True)
bpy.ops.object.select_all(action='DESELECT')
for o in meshes:o.select_set(True)
bpy.context.view_layer.objects.active=meshes[0]
bpy.ops.wm.save_as_mainfile(filepath=str(V/'courtyard-plant.blend'),compress=True)
bpy.ops.export_scene.gltf(filepath=str(O/'courtyard-plant.glb'),export_format='GLB',use_selection=True,export_yup=True,export_animations=False,export_cameras=False,export_lights=False,export_extras=True)
points=[v.co for o in meshes for v in o.data.vertices];triangles=sum(len(p.vertices)-2 for o in meshes for p in o.data.polygons)
manifest={'name':'Courtyard leaf rosette','sourceModel':'Kenney Nature Kit / plant_bushDetailed','license':'CC0-1.0','sourcePage':'https://kenney.nl/assets/nature-kit','up':'+Y','root':[0,0,0],'height':1,'width':round(max(v.x for v in points)-min(v.x for v in points),6),'depth':round(max(v.y for v in points)-min(v.y for v in points),6),'triangles':triangles,'vertices':sum(len(o.data.vertices) for o in meshes),'bytes':(O/'courtyard-plant.glb').stat().st_size,'palette':palette,'containsPot':False,'textures':False,'modifications':['Uniform height normalization to 1.0, horizontal width/depth scaled to 64% to fit courtyard planter','Three flat green material colors assigned by authored leaf face orientation','Original leaf topology and arrangement preserved; no generated replacement leaves'],'wind':'Runtime CPU deformation, lower 8% of normalized height pinned; actual geometry and cast shadows deform together','sha256':hashlib.sha256((O/'courtyard-plant.glb').read_bytes()).hexdigest()};(O/'courtyard-plant-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
# Offline preview in an approximation of the existing courtyard planter.
for o in meshes:o.scale=(1.8,1.8,1.8);o.location.z=.87
profile=[(.48,0),(.6,.1),(.67,.55),(.82,.8),(.84,.92),(.76,.96),(.72,.84)]
verts=[];faces=[];N=20
for radius,z in profile:
 for k in range(N):a=k*2*math.pi/N;verts.append((radius*math.cos(a),radius*math.sin(a),z))
for j in range(len(profile)-1):
 for k in range(N):faces.append((j*N+k,j*N+(k+1)%N,(j+1)*N+(k+1)%N,(j+1)*N+k))
mesh=bpy.data.meshes.new('Preview planter');mesh.from_pydata(verts,[],faces);pot=bpy.data.objects.new('Existing planter approximation',mesh);bpy.context.collection.objects.link(pot);pot.data.materials.append(material('Coral ceramic','D9654C'))
bpy.ops.mesh.primitive_cylinder_add(vertices=32,radius=.71,depth=.04,location=(0,0,.85));bpy.context.object.data.materials.append(material('Soil','785545'))
bpy.ops.mesh.primitive_plane_add(size=200);bpy.context.object.location.z=-.01;bpy.context.object.data.materials.append(material('Paper','EBCFA2'))
sc=bpy.context.scene;sc.render.engine='CYCLES';sc.cycles.samples=32;sc.render.resolution_x=900;sc.render.resolution_y=900;sc.render.resolution_percentage=100;sc.world.color=(.4,.4,.4);sc.view_settings.view_transform='Standard'
for loc,power,size in [((3,-4,6),500,5),((-3,-2,4),180,4),((0,3,5),250,3)]:
 bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=power;o.data.size=size;o.rotation_euler=(Vector((0,0,1.3))-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(3,-6,3.6));cam=bpy.context.object;cam.rotation_euler=(Vector((0,0,1.35))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=3.5;sc.camera=cam;sc.render.filepath=str(V/'preview.png');bpy.ops.render.render(write_still=True)
print('BOTANICAL_RESULT',json.dumps(manifest))
