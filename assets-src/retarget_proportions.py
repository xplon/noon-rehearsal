"""Bake region-specific proportions into mesh/rest skeleton, then retarget FK poses.

Source torso acting, foot orientation and body skin weights are retained; legs
use IK and arm swing is reduced to fit the longer limbs. Segment scales
are baked into rest vertices, never left as nonuniform animated joint scales.
This avoids glTF's inability to represent inherited shear. Sole support is
re-evaluated for each retargeted pose; all horizontal root motion remains zero.
"""
import math
from mathutils import Vector,Matrix,Quaternion

def reshape(rig,meshes,base,samples,world_pool):
    scales={}
    for b in rig.data.bones:
        n=b.name;s=(1,1,1)
        if n=='head':s=(.56,.56,.56)
        elif n=='hips':s=(.8,1,.75)
        elif n=='spine':s=(.76,1.23,.72)
        elif n=='chest':s=(.78,1.2,.72)
        elif n.startswith('upperleg'):s=(.78,3.,.78)
        elif n.startswith('lowerleg'):s=(.72,3.,.72)
        elif n.startswith(('foot.','toes.')):s=(.78,.78,.78)
        elif n.startswith('upperarm'):s=(.78,1.5,.78)
        elif n.startswith('lowerarm'):s=(.7,1.5,.7)
        elif n.startswith(('hand.','wrist.')):s=(.68,.68,.68)
        scales[n]=Vector(s)
    names=[b.name for b in rig.data.bones]
    old_bind={b.name:b.matrix_local.copy() for b in rig.data.bones}
    parents={b.name:(b.parent.name if b.parent else None) for b in rig.data.bones}
    old_inverse={n:m.inverted() for n,m in old_bind.items()}
    S={n:Matrix.Diagonal((*s,1)) for n,s in scales.items()}
    under_hips={n:(n=='hips' or any(p.name=='hips' for p in rig.data.bones[n].parent_recursive)) for n in names}
    def world_transform(old,raise_z=0):
        result={}
        for n in names:
            p=parents[n];q=old[n].to_quaternion().normalized()
            if p:
                offset=old[p].to_quaternion().inverted()@(old[n].translation-old[p].translation)
                offset=Vector(tuple(offset[i]*scales[p][i] for i in range(3)))
                pos=result[p].translation+old[p].to_quaternion()@offset
            else:pos=old[n].translation.copy()
            if n=='hips':pos.z+=raise_z
            result[n]=Matrix.LocRotScale(pos,q,Vector((1,1,1)))
        return result
    new_bind=world_transform(old_bind)
    data=[]
    for o in meshes:
        to_arm=rig.matrix_world.inverted()@o.matrix_world
        from_arm=to_arm.inverted();groups={g.index:g.name for g in o.vertex_groups}
        for v in o.data.vertices:
            weights=[(groups[g.group],g.weight) for g in v.groups if groups[g.group] in old_bind and g.weight>0]
            total=sum(w for _,w in weights);weights=[(n,w/total) for n,w in weights] if total else []
            source=to_arm@v.co
            shaped=sum((w*(new_bind[n]@S[n]@old_inverse[n]@source) for n,w in weights),Vector()) if weights else source
            if o.name.startswith('Rogue_Leg') and source.z<.27:
                foot='foot.l' if 'Left' in o.name else 'foot.r'
                boot=new_bind[foot]@S[foot]@old_inverse[foot]@source
                blend=max(0,min(1,(.27-source.z)/.10));blend=blend*blend*(3-2*blend)
                shaped=shaped.lerp(boot,blend)
            if o.name=='Rogue_Body':
                belly=math.exp(-((source.z-.82)/.24)**2)
                shaped.x*=1-.08*belly;shaped.y*=1-.05*belly
            data.append({'object':o,'vertex':v,'old':source,'new':shaped,'weights':weights,'from_arm':from_arm,'sole':o.name.startswith('Rogue_Leg') and source.z<.10,'support':o.name!='Rogue_Cape'})
    ground_raise=-min(d['new'].z for d in data if d['sole'])
    for n in names:
        if under_hips[n]:new_bind[n].translation.z+=ground_raise
    for d in data:
        d['new'].z+=ground_raise*sum(w for n,w in d['weights'] if under_hips[n])
        d['vertex'].co=d['from_arm']@d['new']
    # Rebuild edit bones with unchanged axes and proportional lengths.
    import bpy
    bpy.context.view_layer.objects.active=rig
    bpy.ops.object.mode_set(mode='EDIT')
    for b in rig.data.edit_bones:
        old_length=b.length;b.matrix=new_bind[b.name];b.length=old_length*scales[b.name].y;b.inherit_scale='FULL'
    bpy.ops.object.mode_set(mode='OBJECT')
    new_bind={b.name:b.matrix_local.copy() for b in rig.data.bones};new_inverse={n:m.inverted() for n,m in new_bind.items()}
    sole=[d for d in data if d['sole']]
    support=[d for d in data if d['support']]
    def skin(d,world,inv,key):
        return sum((w*(world[n]@inv[n]@d[key]) for n,w in d['weights']),Vector())
    contact_checks=[]
    old_stand=world_pool[id(base)]['hips'].translation.copy()
    new_stand=world_transform(world_pool[id(base)],ground_raise)['hips'].translation.copy()
    lengths={}
    for side in ['l','r']:
        h=new_bind['upperleg.'+side].translation;k=new_bind['lowerleg.'+side].translation;a=new_bind['foot.'+side].translation
        lengths[side]=((k-h).length,(a-k).length)
    def solve_legs(world,old,kind):
        seated=max(0,min(1,(old_stand.z-old['hips'].translation.z)/.308724)) if kind in ['sit','rise'] else 0
        target_hip=new_stand.copy();target_hip.x+=(old['hips'].translation.x-old_stand.x)*.8;target_hip.y+=(old['hips'].translation.y-old_stand.y)*.8
        target_hip.z=(new_stand.z*(1-seated)+.07*seated) if seated else new_stand.z+(old['hips'].translation.z-old_stand.z)*1.25
        shift=target_hip-world['hips'].translation
        for n in names:
            if under_hips[n]:world[n].translation+=shift
        factor=(1.35 if kind=='chase' else 1.6)*(1-seated)+2.6*seated
        lift=.85 if kind=='chase' else .6
        for side in ['l','r']:
            un,ln,fn,tn=['upperleg.'+side,'lowerleg.'+side,'foot.'+side,'toes.'+side]
            source=old[fn].translation;neutral=world_pool[id(base)][fn].translation
            ankle=Vector((source.x*.8,source.y*factor,.1452*.78+(source.z-.1452)*lift))
            hip=world[un].translation.copy();delta=ankle-hip;distance=delta.length;direction=delta.normalized();L1,L2=lengths[side]
            distance=min(distance,(L1+L2)*.997);ankle=hip+direction*distance
            a=(L1*L1-L2*L2+distance*distance)/(2*distance);h=math.sqrt(max(0,L1*L1-a*a))
            old_dir=(old[fn].translation-old[un].translation).normalized();pole=old[ln].translation-old[un].translation;pole-=old_dir*pole.dot(old_dir)
            if pole.length<.01:pole=Vector((0,-1,0))
            pole-=direction*pole.dot(direction)
            if pole.length<.01:pole=Vector((0,-1,0))
            knee=hip+direction*a+pole.normalized()*h
            for name,start,end,old_end in [(un,hip,knee,ln),(ln,knee,ankle,fn)]:
                before=(old[old_end].translation-old[name].translation).normalized();after=(end-start).normalized()
                q=before.rotation_difference(after)@old[name].to_quaternion();world[name]=Matrix.LocRotScale(start,q,Vector((1,1,1)))
            world[fn]=Matrix.LocRotScale(ankle,old[fn].to_quaternion(),Vector((1,1,1)))
            toe_offset=old[fn].to_quaternion().inverted()@(old[tn].translation-old[fn].translation)
            world[tn]=Matrix.LocRotScale(ankle+old[fn].to_quaternion()@(toe_offset*.78),old[tn].to_quaternion(),Vector((1,1,1)))
    base_world=world_transform(world_pool[id(base)],ground_raise)
    def relax_arms(world,old,kind):
        seated=max(0,min(1,(old_stand.z-old['hips'].translation.z)/.308724)) if kind in ['sit','rise'] else 0
        for side,sign in [('l',1),('r',-1)]:
            n='upperarm.'+side;pivot=world[n].translation.copy();q=world[n].to_quaternion()
            target=base_world[n].to_quaternion().slerp(q,.58) if kind in ['walk','chase'] else q
            target=Quaternion((0,1,0),sign*.13*(1-seated))@target
            delta=target@q.inverted()
            for prefix in ['upperarm.','lowerarm.','wrist.','hand.','handslot.']:
                b=prefix+side;world[b]=Matrix.LocRotScale(pivot+delta@(world[b].translation-pivot),delta@world[b].to_quaternion(),Vector((1,1,1)))
    def retarget(pose,kind):
        old=world_pool[id(pose)];world=world_transform(old,ground_raise)
        solve_legs(world,old,kind)
        relax_arms(world,old,kind)
        source_sole=min(skin(d,old,old_inverse,'old').z for d in sole)
        target=max(0,source_sole)*.78 if kind=='chase' else 0
        check=support if kind in ['sit','rise'] else sole
        zmin=min(skin(d,world,new_inverse,'new').z for d in check)
        dz=target-zmin
        for n in names:
            if under_hips[n]:world[n].translation.z+=dz
        out={}
        for n in names:
            b=rig.data.bones[n];kw={}
            if b.parent:kw={'parent_matrix':world[b.parent.name],'parent_matrix_local':b.parent.matrix_local}
            m=b.convert_local_to_pose(world[n],b.matrix_local,invert=True,**kw)
            out[n]=m.decompose()
        contact_checks.append({'clip':kind,'supportAfter':round(zmin+dz,8),'sourceSupport':round(source_sole,8)})
        return out
    new_base=retarget(base,'idle')
    new_samples={name:[retarget(pose,name) for pose in poses] for name,poses in samples.items()}
    return new_base,new_samples,{'method':'Region proportions baked into rest mesh and skeleton; source torso acting and foot orientation retained, legs solved with two-bone IK, upper-arm swing reduced; per-frame sole support correction.','jointScaleFactors':{n:list(s) for n,s in scales.items() if any(abs(x-1)>1e-6 for x in s)},'headScale':.56,'locomotionTarget':{'walkFootHorizontalScale':1.6,'chaseFootHorizontalScale':1.35,'walkFootLiftScale':.6,'chaseFootLiftScale':.85,'hipBounceScale':1.25,'upperArmMotionBlend':.58,'standingArmAdductionRad':.13,'seatedHipTarget':.07,'legSolve':'two-bone IK with original knee pole and original foot rotation'},'upperLegLengthScale':3.,'lowerLegLengthScale':3.,'upperArmLengthScale':1.5,'lowerArmLengthScale':1.5,'bellyWidthReduction':.08,'bindGroundRaise':ground_raise,'supportSamples':len(contact_checks),'maxWalkSupportError':max(abs(d['supportAfter']) for d in contact_checks if d['clip']=='walk'),'maxIdleSupportError':max(abs(d['supportAfter']) for d in contact_checks if d['clip']=='idle')}
